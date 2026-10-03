import { Body, ConflictException, Controller, Get, Post, Query } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiQuery, ApiTags } from '@nestjs/swagger';
import { plans, tenants, tenantSubscriptions, usageCounters } from '@yutis/db';
import { asc, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from './auth/access.js';
import { recordPlatformAudit } from './core/audit.js';
import { Ctx, type RequestContext } from './core/context.js';
import { pgErrorCode } from './core/pg.js';
import { openApiSchema, parse } from './core/validation.js';

class PlanDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'standard' }) code!: string;
  @ApiProperty({ example: '標準方案' }) name!: string;
  @ApiProperty({ type: 'object', additionalProperties: true, description: '計價參數；計費模式定案前不解讀' }) pricing!: unknown;
  @ApiProperty() active!: boolean;
}

const CreatePlan = z.object({
  code: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name: z.string().trim().min(1).max(100),
  pricing: z.record(z.string(), z.unknown()).default({}),
}).strict();

class UsageDto {
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty() subdomain!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ description: '在職員工數（目前）' }) activeEmployees!: number;
  @ApiProperty({ description: '啟用中的後台帳號數（目前）' }) staffAccounts!: number;
  @ApiProperty({ description: '該月健檢筆數' }) examsInMonth!: number;
  @ApiProperty({ description: '該月簡訊則數（由營運商負擔，按租戶記錄）' }) smsSent!: number;
  @ApiProperty({ type: Number, nullable: true }) seatLimit!: number | null;
  @ApiProperty() overSeatLimit!: boolean;
}

const Month = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/).optional() });

@ApiTags('billing')
@Controller()
export class PlansUsageController {
  @Get('plans')
  @Requires('tenants:read')
  @ApiOperation({ summary: '方案列表' })
  @ApiOkResponse({ type: [PlanDto] })
  listPlans(@Ctx() ctx: RequestContext): Promise<PlanDto[]> {
    return ctx.tx.select().from(plans).orderBy(asc(plans.code));
  }

  @Post('plans')
  @Requires('subscriptions:write')
  @ApiOperation({ summary: '新增方案', description: '四大計畫不拆賣：方案只差在人數與計價，不開關功能。' })
  @ApiBody({ schema: openApiSchema(CreatePlan) })
  @ApiCreatedResponse({ type: PlanDto })
  async createPlan(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<PlanDto> {
    const input = parse(CreatePlan, body);
    const [existing] = await ctx.tx.select({ id: plans.id }).from(plans).where(eq(plans.code, input.code));
    if (existing) throw new ConflictException({ code: 'plan_exists', message: `Plan ${input.code} already exists` });
    try {
      const [plan] = await ctx.tx.insert(plans).values(input).returning();
      await recordPlatformAudit(ctx, { action: 'plan.create', subjectTable: 'plans', subjectId: plan!.id, detail: input });
      return plan!;
    } catch (error) {
      if (pgErrorCode(error) === '23505') throw new ConflictException({ code: 'plan_exists', message: `Plan ${input.code} already exists` });
      throw error;
    }
  }

  @Get('usage')
  @Requires('tenants:read')
  @ApiOperation({ summary: '各租戶用量（只有計數）', description: '員工與帳號數為目前值；健檢與簡訊為指定月份。平台拿不到任何一筆明細。' })
  @ApiQuery({ name: 'month', required: false, example: '2026-10', description: '預設本月' })
  @ApiOkResponse({ type: [UsageDto] })
  async usage(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<UsageDto[]> {
    const { month } = parse(Month, query);
    const period = month ? `${month}-01` : sql`date_trunc('month', current_date)::date`;
    const { rows } = await ctx.tx.execute<{ tenant_id: string; active_employees: string; staff_accounts: string; exams_in_period: string }>(
      sql`select * from tenant_counts(${period})`);
    const sms = await ctx.tx.select({ tenantId: usageCounters.tenantId, quantity: usageCounters.quantity }).from(usageCounters)
      .where(sql`${usageCounters.metric} = 'sms_sent' and ${usageCounters.period} = ${period}`);
    const all = await ctx.tx.select({ id: tenants.id, slug: tenants.slug, name: tenants.name }).from(tenants).orderBy(asc(tenants.name));
    const seats = await ctx.tx.selectDistinctOn([tenantSubscriptions.tenantId], { tenantId: tenantSubscriptions.tenantId, seatLimit: tenantSubscriptions.seatLimit })
      .from(tenantSubscriptions).orderBy(tenantSubscriptions.tenantId, desc(tenantSubscriptions.startsOn), desc(tenantSubscriptions.createdAt));
    return all.map(t => {
      const counts = rows.find(r => r.tenant_id === t.id);
      const activeEmployees = Number(counts?.active_employees ?? 0);
      const seatLimit = seats.find(s => s.tenantId === t.id)?.seatLimit ?? null;
      return {
        tenantId: t.id, subdomain: t.slug, name: t.name, activeEmployees,
        staffAccounts: Number(counts?.staff_accounts ?? 0), examsInMonth: Number(counts?.exams_in_period ?? 0),
        smsSent: sms.find(s => s.tenantId === t.id)?.quantity ?? 0,
        seatLimit, overSeatLimit: seatLimit != null && activeEmployees > seatLimit,
      };
    });
  }
}
