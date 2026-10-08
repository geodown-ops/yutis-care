/*
 * Payment orders in the platform admin (付款單): create one for a tenant and email its link, resend it, cancel it, or
 * mark it paid by hand after a bank transfer. Card payments arrive through the public payment page
 * (public-payments.controller.ts).
 */
import { BadRequestException, Body, ConflictException, Controller, Get, HttpCode, Inject, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { ApiBody, ApiConflictResponse, ApiCreatedResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiQuery, ApiTags } from '@nestjs/swagger';
import { paymentOrders, paymentOrderStatusEnum, plans, tenants } from '@yutis/db';
import { and, desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { Requires } from '../auth/access.js';
import { recordPlatformAudit } from '../core/audit.js';
import { Ctx, type RequestContext } from '../core/context.js';
import { ApiErrorDto } from '../core/errors.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';
import { latestPeriod, periodOverlap } from '../tenants/subscriptions.js';
import { isExpired, newOrderNumber, newPaymentToken, PaymentsService, todayInTaipei, type PaymentOrder } from './payments.service.js';

type PaymentOrderStatus = (typeof paymentOrderStatusEnum.enumValues)[number];

export class PaymentOrderDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ format: 'uuid' }) tenantId!: string;
  @ApiProperty() tenantName!: string;
  @ApiProperty({ example: 'YC261008A1B2C3' }) orderNumber!: string;
  @ApiProperty({ enum: paymentOrderStatusEnum.enumValues, description: '待付款、已付款、已取消' }) status!: PaymentOrderStatus;
  @ApiProperty({ description: '待付款且已過最後付款日' }) expired!: boolean;
  @ApiProperty({ description: '新台幣，整數' }) amount!: number;
  @ApiProperty() description!: string;
  @ApiProperty() planCode!: string;
  @ApiProperty() planName!: string;
  @ApiProperty({ type: Number, nullable: true }) seatLimit!: number | null;
  @ApiProperty({ type: String, format: 'date' }) periodStartsOn!: string;
  @ApiProperty({ type: String, format: 'date', nullable: true }) periodEndsOn!: string | null;
  @ApiProperty() payerName!: string;
  @ApiProperty() payerEmail!: string;
  @ApiProperty({ type: String, format: 'date' }) expiresOn!: string;
  @ApiProperty({ description: '付款頁連結（官網 /pay/）' }) payUrl!: string;
  @ApiProperty({ type: String, nullable: true, enum: ['card', 'transfer'], description: '信用卡（TapPay）或匯款（人工標記）' }) method!: string | null;
  @ApiProperty({ type: String, nullable: true }) cardLastFour!: string | null;
  @ApiProperty({ type: String, nullable: true, description: 'TapPay 交易編號' }) recTradeId!: string | null;
  @ApiProperty({ type: String, nullable: true, description: '人工標記已付款時的備註' }) paidNote!: string | null;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt!: Date | null;
  @ApiProperty({ description: '付款後已自動新增訂閱期間；已付款但為 false 時，請到租戶頁手動新增' }) subscriptionAdded!: boolean;
  @ApiProperty({ type: String, format: 'date-time' }) createdAt!: Date;
  @ApiProperty({ type: String, nullable: true, description: '建立人 Email' }) createdBy!: string | null;
  @ApiPropertyOptional({ description: '這次是否寄出付款通知信（只在建立與重寄時回傳）' }) emailSent?: boolean;
}

export const CreatePaymentOrder = z.object({
  tenantId: z.uuid(),
  planCode: z.string().min(1),
  seatLimit: z.number().int().positive().nullable(),
  startsOn: z.iso.date(),
  endsOn: z.iso.date().nullable().default(null),
  amount: z.number().int().positive().max(99_999_999),
  /** Default: plan, period and seats. */
  description: z.string().trim().min(1).max(80).optional(),
  payerName: z.string().trim().min(1).max(50),
  payerEmail: z.email().trim().toLowerCase().max(254),
  /** Default: 14 days from today. */
  expiresOn: z.iso.date().optional(),
  sendEmail: z.boolean().default(true),
}).strict().refine(o => !o.endsOn || o.endsOn >= o.startsOn, { message: 'endsOn must not be before startsOn', path: ['endsOn'] });

const MarkPaid = z.object({ note: z.string().trim().min(1).max(200) }).strict();
const ListQuery = z.object({ tenantId: z.uuid().optional() });

const DEFAULT_DAYS_TO_PAY = 14;
const addDays = (isoDate: string, days: number) => new Date(Date.parse(isoDate) + days * 86_400_000).toISOString().slice(0, 10);
const slashDate = (isoDate: string) => isoDate.replaceAll('-', '/');

export const defaultDescription = (planName: string, startsOn: string, endsOn: string | null, seatLimit: number | null) =>
  `${planName} ${slashDate(startsOn)}${endsOn ? `–${slashDate(endsOn)}` : ' 起'}${seatLimit ? `，${seatLimit} 人` : ''}`;

const notFound = () => new NotFoundException({ code: 'payment_order_not_found', message: 'No such payment order' });

@ApiTags('payments')
@Controller('payment-orders')
export class PaymentOrdersController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Get()
  @Requires('tenants:read')
  @ApiOperation({ summary: '付款單列表', description: '新的在前；可只看一個租戶。' })
  @ApiQuery({ name: 'tenantId', required: false, type: String, format: 'uuid' })
  @ApiOkResponse({ type: [PaymentOrderDto] })
  async list(@Ctx() ctx: RequestContext, @Query() query: unknown): Promise<PaymentOrderDto[]> {
    const { tenantId } = parse(ListQuery, query);
    return this.select(ctx, tenantId ? eq(paymentOrders.tenantId, tenantId) : undefined);
  }

  @Post()
  @Requires('subscriptions:write')
  @ApiOperation({
    summary: '建立付款單',
    description: '金額由營運填寫（方案的計價參數仍不解讀）。付款後自動新增這一期訂閱（同「續約／新期間」，狀態為啟用），所以開始日要晚於租戶最近一期的開始日。預設寄付款通知信給付款聯絡人。',
  })
  @ApiBody({ schema: openApiSchema(CreatePaymentOrder) })
  @ApiCreatedResponse({ type: PaymentOrderDto })
  @ApiConflictResponse({ description: '開始日沒有晚於最近一期（period_overlap），或租戶已結束（tenant_closed）', type: ApiErrorDto })
  async create(@Ctx() ctx: RequestContext, @Body() body: unknown): Promise<PaymentOrderDto> {
    const input = parse(CreatePaymentOrder, body);
    const today = todayInTaipei();
    const expiresOn = input.expiresOn ?? addDays(today, DEFAULT_DAYS_TO_PAY);
    if (expiresOn < today) throw new BadRequestException({ code: 'validation_failed', message: 'expiresOn must not be in the past' });
    const [tenant] = await ctx.tx.select({ id: tenants.id, name: tenants.name, status: tenants.status }).from(tenants).where(eq(tenants.id, input.tenantId));
    if (!tenant) throw new NotFoundException({ code: 'tenant_not_found', message: 'No such tenant' });
    if (tenant.status === 'closed') throw new ConflictException({ code: 'tenant_closed', message: 'The tenant is closed' });
    const [plan] = await ctx.tx.select().from(plans).where(and(eq(plans.code, input.planCode), eq(plans.active, true)));
    if (!plan) throw new BadRequestException({ code: 'unknown_plan', message: `No active plan ${input.planCode}` });
    const latest = await latestPeriod(ctx.tx, tenant.id);
    if (latest && input.startsOn <= latest.startsOn) throw periodOverlap(latest.startsOn);

    const [order] = await ctx.tx.insert(paymentOrders).values({
      tenantId: tenant.id, orderNumber: newOrderNumber(today), token: newPaymentToken(), amount: input.amount,
      description: input.description ?? defaultDescription(plan.name, input.startsOn, input.endsOn, input.seatLimit),
      planId: plan.id, seatLimit: input.seatLimit, periodStartsOn: input.startsOn, periodEndsOn: input.endsOn,
      payerName: input.payerName, payerEmail: input.payerEmail, expiresOn, createdBy: ctx.user.id,
    }).returning();
    const emailSent = input.sendEmail ? await this.payments.sendPaymentRequest(order!, tenant.name) : false;
    await recordPlatformAudit(ctx, {
      action: 'payment_order.create', tenantId: tenant.id, subjectTable: 'payment_orders', subjectId: order!.id,
      detail: { orderNumber: order!.orderNumber, amount: input.amount, planCode: input.planCode, startsOn: input.startsOn, endsOn: input.endsOn, emailSent },
    });
    return { ...(await this.one(ctx, order!.id)), ...(input.sendEmail ? { emailSent } : {}) };
  }

  @Post(':id/email')
  @HttpCode(200)
  @Requires('subscriptions:write')
  @ApiOperation({ summary: '重寄付款通知信' })
  @ApiOkResponse({ type: PaymentOrderDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '付款單不是待付款（payment_order_closed）', type: ApiErrorDto })
  async resend(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentOrderDto> {
    const order = await this.pending(ctx, id);
    const [tenant] = await ctx.tx.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, order.tenantId));
    const emailSent = await this.payments.sendPaymentRequest(order, tenant!.name);
    await recordPlatformAudit(ctx, { action: 'payment_order.email', tenantId: order.tenantId, subjectTable: 'payment_orders', subjectId: id, detail: { emailSent } });
    return { ...(await this.one(ctx, id)), emailSent };
  }

  @Post(':id/cancel')
  @HttpCode(200)
  @Requires('subscriptions:write')
  @ApiOperation({ summary: '取消付款單', description: '取消後付款頁不能再付款。' })
  @ApiOkResponse({ type: PaymentOrderDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '付款單不是待付款（payment_order_closed），或付款正在處理（payment_in_progress）', type: ApiErrorDto })
  async cancel(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string): Promise<PaymentOrderDto> {
    const order = await this.pending(ctx, id);
    await ctx.tx.update(paymentOrders).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(paymentOrders.id, id));
    await recordPlatformAudit(ctx, { action: 'payment_order.cancel', tenantId: order.tenantId, subjectTable: 'payment_orders', subjectId: id, detail: { orderNumber: order.orderNumber } });
    return this.one(ctx, id);
  }

  @Post(':id/mark-paid')
  @HttpCode(200)
  @Requires('subscriptions:write')
  @ApiOperation({ summary: '標記已付款（匯款入帳）', description: '和刷卡付款一樣新增這一期訂閱並寄付款完成信。' })
  @ApiBody({ schema: openApiSchema(MarkPaid) })
  @ApiOkResponse({ type: PaymentOrderDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '付款單不是待付款（payment_order_closed），或付款正在處理（payment_in_progress）', type: ApiErrorDto })
  async markPaid(@Ctx() ctx: RequestContext, @Param('id', ParseUUIDPipe) id: string, @Body() body: unknown): Promise<PaymentOrderDto> {
    const { note } = parse(MarkPaid, body);
    const order = await this.pending(ctx, id);
    const { order: paid, subscriptionAdded } = await this.payments.applyPayment(ctx.tx, order, { method: 'transfer', note });
    await recordPlatformAudit(ctx, {
      action: 'payment_order.mark_paid', tenantId: order.tenantId, subjectTable: 'payment_orders', subjectId: id,
      detail: { orderNumber: order.orderNumber, amount: order.amount, note, subscriptionAdded },
    });
    // Sent before the commit; the payment itself is in place either way.
    await this.payments.sendReceipt(paid);
    return this.one(ctx, id);
  }

  /** Lock a pending order (a card payment holding it answers payment_in_progress). Expired ones may still be marked paid. */
  private async pending(ctx: RequestContext, id: string): Promise<PaymentOrder> {
    let order: PaymentOrder | undefined;
    try {
      [order] = await ctx.tx.select().from(paymentOrders).where(eq(paymentOrders.id, id)).for('update', { noWait: true });
    } catch (error) {
      if (pgErrorCode(error) === '55P03') {
        throw new ConflictException({ code: 'payment_in_progress', message: 'A card payment for this order is in progress' });
      }
      throw error;
    }
    if (!order) throw notFound();
    if (order.status !== 'pending') throw new ConflictException({ code: 'payment_order_closed', message: `The order is already ${order.status}` });
    return order;
  }

  private async one(ctx: RequestContext, id: string): Promise<PaymentOrderDto> {
    const [row] = await this.select(ctx, eq(paymentOrders.id, id));
    if (!row) throw notFound();
    return row;
  }

  private async select(ctx: RequestContext, where: ReturnType<typeof eq> | undefined): Promise<PaymentOrderDto[]> {
    const rows = await ctx.tx.select({
      order: paymentOrders, tenantName: tenants.name, planCode: plans.code, planName: plans.name,
      createdBy: sql<string | null>`(select email from platform_users p where p.id = ${paymentOrders.createdBy})`,
    }).from(paymentOrders)
      .innerJoin(tenants, eq(tenants.id, paymentOrders.tenantId))
      .innerJoin(plans, eq(plans.id, paymentOrders.planId))
      .where(where).orderBy(desc(paymentOrders.createdAt));
    const today = todayInTaipei();
    return rows.map(({ order: o, tenantName, planCode, planName, createdBy }) => ({
      id: o.id, tenantId: o.tenantId, tenantName, orderNumber: o.orderNumber, status: o.status, expired: isExpired(o, today), amount: o.amount,
      description: o.description, planCode, planName, seatLimit: o.seatLimit, periodStartsOn: o.periodStartsOn, periodEndsOn: o.periodEndsOn,
      payerName: o.payerName, payerEmail: o.payerEmail, expiresOn: o.expiresOn, payUrl: this.payments.payUrl(o.token), method: o.method,
      cardLastFour: o.cardLastFour, recTradeId: o.recTradeId, paidNote: o.paidNote, paidAt: o.paidAt, subscriptionAdded: o.subscriptionId !== null,
      createdAt: o.createdAt, createdBy,
    }));
  }
}
