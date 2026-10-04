/*
 * What reaches people outside occupational health: work-arrangement advice (工作安排建議) for HR, notices to an
 * employee's department manager, and links for employees to confirm records about them. None of these carry clinical
 * detail: only the advice itself.
 */
import { createHash, randomBytes } from 'node:crypto';
import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiTags } from '@nestjs/swagger';
import { departments, employeeAcknowledgements, employees, interviews, managerNotices, maternalCases, maternalInterviews, users, workloadAssessments } from '@yutis/db';
import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { StaffOnly } from '../auth/access.js';
import { ADVICE_ROLES } from '../auth/permissions.js';
import { tenantOrigin, type ApiConfig } from '../config.js';
import { recordAudit, type AuditEntry } from '../core/audit.js';
import { Ctx, staff, type RequestContext } from '../core/context.js';
import { API_CONFIG } from '../core/database.js';
import { acknowledgementEmail } from '../core/emails.js';
import { Notifier } from '../core/mail.js';
import { openApiSchema, parse } from '../core/validation.js';
import { employeeInScope, mySiteIds } from './common.js';
import { workAdviceOf } from './work-advice.js';
import { Clinical } from './ergo.controller.js';

/** How long an emailed confirmation link stays valid. */
export const SIGN_LINK_DAYS = 14;
export const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

class WorkAdviceDto {
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ enum: ['異常工作負荷', '母性健康保護'] }) programme!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) on!: string | null;
  @ApiProperty({ description: '工作安排建議（不含醫療內容）' }) advice!: string;
  @ApiProperty({ type: [String], description: '工作限制' }) restrictions!: string[];
}
const NOTICE_PROGRAMMES = { interviews: '異常工作負荷', maternal_interviews: '母性健康保護' } as const;
/** What a 部門主管 sees instead of the programme: naming 母性健康保護 would tell them an employee may be pregnant. */
const MANAGER_PROGRAMME = '工作調整';
type NoticeProgramme = (typeof NOTICE_PROGRAMMES)[keyof typeof NOTICE_PROGRAMMES] | typeof MANAGER_PROGRAMME;
const noticeProgramme = (subjectTable: string): NoticeProgramme => NOTICE_PROGRAMMES[subjectTable as keyof typeof NOTICE_PROGRAMMES];

class NoticeDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) employeeId!: string;
  @ApiProperty() empNo!: string;
  @ApiProperty() name!: string;
  @ApiProperty({
    enum: [...Object.values(NOTICE_PROGRAMMES), MANAGER_PROGRAMME],
    description: `建議來自哪個計畫的面談。部門主管看到的一律是「${MANAGER_PROGRAMME}」，不透露計畫（例如母性健康保護會讓主管知道員工可能懷孕）。`,
  })
  programme!: NoticeProgramme;
  @ApiProperty() advice!: string;
  @ApiProperty({ type: String, format: 'date-time' }) sentAt!: Date;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) readAt!: Date | null;
}
class ManagerDto {
  @ApiProperty({ format: 'uuid', description: '通知主管時的 managerUserId' }) id!: string;
  @ApiProperty() name!: string;
  @ApiProperty({ format: 'email', description: '通知會寄到這個 Email' }) email!: string;
  @ApiProperty({
    type: [String], format: 'uuid',
    description: '這位主管負責的部門（部門設定的主管 Email 與帳號 Email 相同），只列你負責廠區內的部門',
  })
  departmentIds!: string[];
}
class UnreadNoticesDto {
  @ApiProperty({ description: '尚未讀取的通知數' }) unread!: number;
}
class LinkDto {
  @ApiProperty({ description: '寄給員工的一次性連結（只回傳這一次，不儲存）' }) url!: string;
  @ApiProperty({ type: String, format: 'date-time' }) expiresAt!: Date;
  @ApiProperty({ description: '會寄通知信給員工（寄信服務已設定，且員工有 Email）；false 時請用其他方式把連結交給員工' }) emailed!: boolean;
}

const CreateNotice = z.object({
  employeeId: z.uuid(), managerUserId: z.uuid(), subjectTable: z.enum(['interviews', 'maternal_interviews']), subjectId: z.uuid(),
  advice: z.string().trim().min(1).max(1000),
}).strict();

@ApiTags('programs')
@Controller('programs')
export class AdviceController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig, private readonly notifier: Notifier) {}

  @Get('work-advice')
  @StaffOnly({ data: 'work', feature: 'programs', roles: ADVICE_ROLES })
  @ApiOperation({ summary: '工作安排建議', description: '負責廠區員工的面談後工作安排建議，給人資執行；不含任何健康或醫療內容。' })
  @ApiOkResponse({ type: [WorkAdviceDto] })
  async workAdvice(@Ctx() ctx: RequestContext): Promise<WorkAdviceDto[]> {
    const sites = await mySiteIds(ctx);
    if (!sites.length) return [];
    const workload = await ctx.tx.select({ employeeId: employees.id, empNo: employees.empNo, name: employees.name, on: interviews.interviewedOn, advice: interviews.workAdvice })
      .from(interviews).innerJoin(workloadAssessments, eq(workloadAssessments.id, interviews.assessmentId)).innerJoin(employees, eq(employees.id, workloadAssessments.employeeId))
      .where(and(inArray(employees.siteId, sites), sql`${interviews.workAdvice} is not null`)).orderBy(desc(interviews.interviewedOn));
    const maternal = await ctx.tx.select({
      employeeId: employees.id, empNo: employees.empNo, name: employees.name, on: maternalInterviews.interviewedOn,
      fit: maternalInterviews.fitAdvice, limits: maternalInterviews.limits, arrangement: maternalInterviews.agreedArrangement,
    }).from(maternalInterviews).innerJoin(maternalCases, eq(maternalCases.id, maternalInterviews.caseId)).innerJoin(employees, eq(employees.id, maternalCases.employeeId))
      .where(inArray(employees.siteId, sites)).orderBy(desc(maternalInterviews.interviewedOn));
    const result: WorkAdviceDto[] = [
      ...workload.map(w => {
        const a = workAdviceOf(w.advice)!;
        return {
          employeeId: w.employeeId, empNo: w.empNo, name: w.name, programme: '異常工作負荷', on: w.on,
          advice: [a.fitness, a.suggestion, a.period && `措施期間：${a.period}`].filter(Boolean).join('；'),
          restrictions: [...a.restrictions, a.adjustHours, a.changeWork].filter(Boolean),
        };
      }),
      ...maternal.map(m => ({
        employeeId: m.employeeId, empNo: m.empNo, name: m.name, programme: '母性健康保護', on: m.on,
        advice: [m.fit, m.arrangement].filter(Boolean).join('；'), restrictions: m.limits,
      })),
    ];
    if (result.length) await recordAudit(ctx, result.map((r): AuditEntry => ({ action: 'read', subjectTable: 'work_advice', employeeId: r.employeeId, dataCategory: 'work' })));
    return result;
  }

  @Get('managers')
  @Clinical()
  @ApiOperation({
    summary: '可通知的部門主管',
    description: '租戶內所有啟用中的部門主管帳號；departmentIds 依部門設定的主管 Email 對應，可用來預先選好員工所屬部門的主管。',
  })
  @ApiOkResponse({ type: [ManagerDto] })
  async managers(@Ctx() ctx: RequestContext): Promise<ManagerDto[]> {
    const managers = await ctx.tx.select({ id: users.id, name: users.name, email: users.email }).from(users)
      .where(and(eq(users.role, '部門主管'), eq(users.active, true))).orderBy(asc(users.name));
    const sites = await mySiteIds(ctx);
    const depts = sites.length
      ? await ctx.tx.select({ id: departments.id, managerEmail: departments.managerEmail }).from(departments)
        .where(and(inArray(departments.siteId, sites), sql`${departments.managerEmail} is not null`))
      : [];
    return managers.map(m => ({
      id: m.id, name: m.name, email: m.email,
      departmentIds: depts.filter(d => d.managerEmail!.toLowerCase() === m.email.toLowerCase()).map(d => d.id),
    }));
  }

  @Post('notices')
  @Clinical()
  @ApiOperation({ summary: '通知部門主管工作安排建議', description: '主管只會看到這段建議文字。' })
  @ApiBody({ schema: openApiSchema(CreateNotice) })
  @ApiCreatedResponse({ type: NoticeDto })
  async notify(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<NoticeDto> {
    const input = parse(CreateNotice, body);
    const employee = await employeeInScope(ctx, input.employeeId);
    const [manager] = await ctx.tx.select().from(users).where(and(eq(users.id, input.managerUserId), eq(users.role, '部門主管'), eq(users.active, true)));
    if (!manager) throw new BadRequestException({ code: 'not_a_manager', message: 'The recipient must be an active 部門主管' });
    const [row] = await ctx.tx.insert(managerNotices).values({ ...input, tenantId: ctx.tenant.id, createdBy: staff(ctx).userId }).returning();
    await recordAudit(ctx, { action: 'create', subjectTable: 'manager_notices', subjectId: row!.id, employeeId: employee.id, dataCategory: 'work', reason: `notice to ${manager.id}` });
    return {
      id: row!.id, employeeId: employee.id, empNo: employee.empNo, name: employee.name, programme: noticeProgramme(row!.subjectTable),
      advice: row!.advice, sentAt: row!.createdAt, readAt: null,
    };
  }

  @Get('notices')
  @StaffOnly({ roles: ['部門主管'] })
  @ApiOperation({ summary: '我收到的工作安排通知（部門主管）', description: '只列出通知給自己的；讀取後標記已讀。' })
  @ApiOkResponse({ type: [NoticeDto] })
  async myNotices(@Ctx() ctx: RequestContext): Promise<NoticeDto[]> {
    const me = staff(ctx).userId;
    const rows = await ctx.tx.select({ n: managerNotices, empNo: employees.empNo, name: employees.name }).from(managerNotices)
      .innerJoin(employees, eq(employees.id, managerNotices.employeeId)).where(eq(managerNotices.managerUserId, me)).orderBy(desc(managerNotices.createdAt));
    if (rows.length) {
      await ctx.tx.update(managerNotices).set({ readAt: new Date() }).where(and(eq(managerNotices.managerUserId, me), isNull(managerNotices.readAt)));
      await recordAudit(ctx, rows.map((r): AuditEntry => ({ action: 'read', subjectTable: 'manager_notices', subjectId: r.n.id, employeeId: r.n.employeeId, dataCategory: 'work' })));
    }
    return rows.map(r => ({
      id: r.n.id, employeeId: r.n.employeeId, empNo: r.empNo, name: r.name, programme: MANAGER_PROGRAMME,
      advice: r.n.advice, sentAt: r.n.createdAt, readAt: r.n.readAt,
    }));
  }

  @Get('notices/unread')
  @StaffOnly({ roles: ['部門主管'] })
  @ApiOperation({ summary: '我未讀的工作安排通知數（部門主管）', description: '只回傳數字，不會標記已讀；給選單上的提示用。' })
  @ApiOkResponse({ type: UnreadNoticesDto })
  async unreadNotices(@Ctx() ctx: RequestContext): Promise<UnreadNoticesDto> {
    const [{ unread }] = await ctx.tx.select({ unread: count() }).from(managerNotices)
      .where(and(eq(managerNotices.managerUserId, staff(ctx).userId), isNull(managerNotices.readAt))) as [{ unread: number }];
    return { unread };
  }

  @Post('acknowledgements/:id/link')
  @Clinical()
  @ApiOperation({
    summary: '產生員工確認連結',
    description: `一次性、${SIGN_LINK_DAYS} 天內有效，只能開啟這一份紀錄；重新產生會讓舊連結失效。連結只回傳這一次，資料庫只存雜湊；員工有 Email 時同時寄通知信（員工端語言，信中不含健康內容）。`,
  })
  @ApiCreatedResponse({ type: LinkDto })
  async link(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<LinkDto> {
    const [ack] = await ctx.tx.select().from(employeeAcknowledgements).where(eq(employeeAcknowledgements.id, id));
    if (!ack) throw new NotFoundException({ code: 'not_found', message: 'No such acknowledgement' });
    if (ack.confirmedAt) throw new BadRequestException({ code: 'already_confirmed', message: 'Already confirmed' });
    const employee = await employeeInScope(ctx, ack.employeeId);
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + SIGN_LINK_DAYS * 86_400_000);
    await ctx.tx.update(employeeAcknowledgements).set({ tokenHash: hashToken(token), tokenExpiresAt: expiresAt, sentAt: new Date(), updatedAt: new Date() })
      .where(eq(employeeAcknowledgements.id, id));
    await recordAudit(ctx, { action: 'update', subjectTable: 'employee_acknowledgements', subjectId: id, employeeId: employee.id, reason: 'confirmation link issued' });
    const url = `${tenantOrigin(this.config, ctx.tenant.slug)}/me/sign/${token}`;
    if (employee.email) {
      await this.notifier.email(ctx, acknowledgementEmail({
        to: employee.email, acknowledgementId: id, name: employee.name, lang: employee.lang, tenantName: ctx.tenant.name, url, days: SIGN_LINK_DAYS,
      }));
    }
    return { url, expiresAt, emailed: Boolean(employee.email) && this.notifier.delivers };
  }
}
