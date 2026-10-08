/*
 * The payment page's API (care.yutis.net/pay/?t=<token>), without signing in: the load balancer exposes only
 * /platform-api/public/* on the site's host. Whoever has an order's link may see and pay that one order, like the
 * Bazar site's payment page; the token is 24 random bytes. TapPay posts 3D Secure results to tappay-notify.
 */
import { Body, ConflictException, Controller, Get, HttpCode, HttpException, Inject, Logger, NotFoundException, Param, Post, Req } from '@nestjs/common';
import { ApiBadRequestResponse, ApiBody, ApiConflictResponse, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiProperty, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { paymentOrders, tenants, type Db, type Tx } from '@yutis/db';
import { eq } from 'drizzle-orm';
import type { FastifyRequest } from 'fastify';
import { z } from 'zod';
import { Public } from '../auth/access.js';
import { DB } from '../core/database.js';
import { ApiErrorDto } from '../core/errors.js';
import { pgErrorCode } from '../core/pg.js';
import { openApiSchema, parse } from '../core/validation.js';
import type { ChargeResult } from '../integrations/tappay.js';
import { isExpired, PaymentsService, type Actor, type PaymentOrder } from './payments.service.js';

class CardSetupDto {
  @ApiProperty({ description: 'TapPay App ID（公開值）' }) appId!: number;
  @ApiProperty({ description: 'TapPay App Key（公開的前端金鑰）' }) appKey!: string;
  @ApiProperty({ enum: ['sandbox', 'production'] }) env!: 'sandbox' | 'production';
}

export class PublicPaymentDto {
  @ApiProperty({ example: 'YC261008A1B2C3' }) orderNumber!: string;
  @ApiProperty({ description: '付款的公司（租戶名稱）' }) tenantName!: string;
  @ApiProperty() description!: string;
  @ApiProperty({ description: '新台幣，整數' }) amount!: number;
  @ApiProperty({ enum: ['pending', 'paid', 'cancelled', 'expired'], description: '待付款、已付款、已取消、已逾期' }) status!: 'pending' | 'paid' | 'cancelled' | 'expired';
  @ApiProperty({ type: String, format: 'date', description: '最後付款日（台灣時間，含當日）' }) expiresOn!: string;
  @ApiProperty({ description: '付款聯絡人，用來預填持卡人' }) payerName!: string;
  @ApiProperty() payerEmail!: string;
  @ApiProperty({ type: String, format: 'date-time', nullable: true }) paidAt!: Date | null;
  @ApiProperty({ type: String, nullable: true, enum: ['card', 'transfer'] }) method!: string | null;
  @ApiProperty({ type: String, nullable: true }) cardLastFour!: string | null;
  @ApiProperty({ type: CardSetupDto, nullable: true, description: '線上刷卡的 TapPay SDK 設定；null 表示未開放刷卡' }) card!: CardSetupDto | null;
}

class PayResultDto {
  @ApiProperty({ enum: ['paid', 'verify'], description: 'paid：已付款；verify：請把付款人導到 paymentUrl 做 3D 驗證，完成後會回到付款頁（threeds=1）' })
  result!: 'paid' | 'verify';
  @ApiPropertyOptional() paymentUrl?: string;
  @ApiProperty({ type: PublicPaymentDto }) payment!: PublicPaymentDto;
}

export const PayRequest = z.object({
  /** TPDirect.card.getPrime() */
  prime: z.string().min(1).max(200),
  cardholder: z.object({
    name: z.string().trim().min(1).max(50),
    email: z.email().trim().max(254),
    phoneNumber: z.string().trim().regex(/^(\+?\d{8,15}|09\d{8})$/),
  }).strict(),
}).strict();

const notFound = () => new NotFoundException({ code: 'payment_not_found', message: 'No such payment order' });

@ApiTags('payments')
@Controller('public/payments')
export class PublicPaymentsController {
  private readonly logger = new Logger(PublicPaymentsController.name);

  constructor(@Inject(DB) private readonly db: Db, @Inject(PaymentsService) private readonly payments: PaymentsService) {}

  @Post('tappay-notify')
  @HttpCode(200)
  @Public()
  @ApiOperation({
    summary: 'TapPay 3D 驗證結果通知（TapPay 伺服器呼叫）',
    description: '一律回 { status: 0 } 讓 TapPay 不再重送。不採信通知內容，只用其中的 order_number 向 TapPay 交易紀錄查詢後才入帳。',
  })
  async notify(@Req() request: FastifyRequest, @Body() body: unknown): Promise<{ status: 0 }> {
    const orderNumber = typeof body === 'object' && body && typeof (body as { order_number?: unknown }).order_number === 'string'
      ? (body as { order_number: string }).order_number : '';
    if (orderNumber) {
      try {
        await this.payments.settleFromGateway(eq(paymentOrders.orderNumber, orderNumber), this.actor(request, 'TapPay'));
      } catch (error) {
        this.logger.error(`TapPay notify for ${orderNumber}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { status: 0 };
  }

  @Get(':token')
  @Public()
  @ApiOperation({ summary: '付款頁：付款單內容（不需登入）' })
  @ApiOkResponse({ type: PublicPaymentDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async get(@Param('token') token: string): Promise<PublicPaymentDto> {
    return this.describe(await this.byToken(token));
  }

  @Post(':token/pay')
  @HttpCode(200)
  @Public()
  @ApiOperation({
    summary: '付款頁：信用卡付款（TapPay Pay by Prime）',
    description: '前端以 TapPay 安全欄位取得 prime 後送來，卡號不經過 Yutis Care。啟用 3D 驗證時回 result=verify 與銀行驗證頁網址。',
  })
  @ApiBody({ schema: openApiSchema(PayRequest) })
  @ApiOkResponse({ type: PayResultDto })
  @ApiBadRequestResponse({ type: ApiErrorDto })
  @ApiConflictResponse({ description: '已付款（already_paid）、已取消（order_cancelled）、已逾期（order_expired）、另一筆付款正在處理（payment_in_progress）', type: ApiErrorDto })
  async pay(@Req() request: FastifyRequest, @Param('token') token: string, @Body() body: unknown): Promise<PayResultDto> {
    const input = parse(PayRequest, body);
    const gateway = this.payments.gateway;
    if (!gateway.clientConfig()) throw new HttpException({ code: 'payments_unavailable', message: 'Card payments are not configured' }, 503);
    const actor = this.actor(request, input.cardholder.email);

    const outcome = await this.lockForPayment(token, async (tx, order) => {
      let charge: ChargeResult;
      try {
        charge = await gateway.charge({
          prime: input.prime, amount: order.amount, orderNumber: order.orderNumber, details: `Yutis Care ${order.description}`,
          cardholder: input.cardholder, ...(gateway.use3DS ? { threeDS: this.payments.threeDSUrls(order.token) } : {}),
        });
      } catch (error) {
        // The answer was lost (timeout, connection): the card may have been charged. Ask before letting them try again.
        this.logger.error(`Charge for ${order.orderNumber} failed: ${error instanceof Error ? error.message : String(error)}`);
        const trade = await gateway.findPaidTrade({ orderNumber: order.orderNumber }).catch(() => null);
        if (!trade) throw new HttpException({ code: 'gateway_unavailable', message: 'The payment service did not answer' }, 502);
        charge = { kind: 'paid', trade };
      }
      if (charge.kind === 'declined') return { charge, order };
      if (charge.kind === 'verify') {
        const [updated] = await tx.update(paymentOrders).set({ pendingTradeId: charge.recTradeId || null, updatedAt: new Date() })
          .where(eq(paymentOrders.id, order.id)).returning();
        return { charge, order: updated! };
      }
      const { order: paid, subscriptionAdded } = await this.payments.applyPayment(tx, order, { method: 'card', trade: charge.trade });
      await this.payments.auditPublic(tx, paid, 'payment_order.pay', actor, { method: 'card', recTradeId: charge.trade.recTradeId, subscriptionAdded });
      return { charge, order: paid };
    });

    if (outcome.charge.kind === 'declined') {
      throw new HttpException({ code: 'card_declined', message: `TapPay ${outcome.charge.code}: ${outcome.charge.message}` }, 402);
    }
    if (outcome.charge.kind === 'paid') await this.payments.sendReceipt(outcome.order);
    const payment = await this.describe(outcome.order);
    return outcome.charge.kind === 'verify'
      ? { result: 'verify', paymentUrl: outcome.charge.paymentUrl, payment }
      : { result: 'paid', payment };
  }

  @Post(':token/verify')
  @HttpCode(200)
  @Public()
  @ApiOperation({ summary: '付款頁：3D 驗證回來後確認結果', description: '向 TapPay 交易紀錄查詢；已入帳就標為已付款。回傳付款單目前狀態。' })
  @ApiOkResponse({ type: PublicPaymentDto })
  @ApiNotFoundResponse({ type: ApiErrorDto })
  async verify(@Req() request: FastifyRequest, @Param('token') token: string): Promise<PublicPaymentDto> {
    const order = await this.byToken(token);
    if (order.status !== 'pending' || !this.payments.gateway.clientConfig()) return this.describe(order);
    try {
      const settled = await this.payments.settleFromGateway(eq(paymentOrders.id, order.id), this.actor(request, order.payerEmail));
      return this.describe(settled ?? order);
    } catch (error) {
      this.logger.error(`Verify for ${order.orderNumber}: ${error instanceof Error ? error.message : String(error)}`);
      throw new HttpException({ code: 'gateway_unavailable', message: 'The payment service did not answer' }, 502);
    }
  }

  /**
   * Run a charge holding the order's row lock, so two tabs (or a double click) cannot both charge the card: the second
   * is told a payment is in progress.
   */
  private async lockForPayment<T>(token: string, run: (tx: Tx, order: PaymentOrder) => Promise<T>): Promise<T> {
    try {
      return await this.db.transaction(async tx => {
        const [order] = await tx.select().from(paymentOrders).where(eq(paymentOrders.token, token)).for('update', { noWait: true });
        if (!order) throw notFound();
        if (order.status === 'paid') throw new ConflictException({ code: 'already_paid', message: 'This order is already paid' });
        if (order.status === 'cancelled') throw new ConflictException({ code: 'order_cancelled', message: 'This order was cancelled' });
        if (isExpired(order)) throw new ConflictException({ code: 'order_expired', message: 'This order is past its last day to pay' });
        return run(tx, order);
      });
    } catch (error) {
      if (pgErrorCode(error) === '55P03') throw new ConflictException({ code: 'payment_in_progress', message: 'Another payment for this order is in progress' });
      throw error;
    }
  }

  private async byToken(token: string): Promise<PaymentOrder> {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw notFound();
    const [order] = await this.db.select().from(paymentOrders).where(eq(paymentOrders.token, token));
    if (!order) throw notFound();
    return order;
  }

  private async describe(o: PaymentOrder): Promise<PublicPaymentDto> {
    const [tenant] = await this.db.select({ name: tenants.name }).from(tenants).where(eq(tenants.id, o.tenantId));
    return {
      orderNumber: o.orderNumber, tenantName: tenant?.name ?? '', description: o.description, amount: o.amount,
      status: isExpired(o) ? 'expired' : o.status, expiresOn: o.expiresOn, payerName: o.payerName, payerEmail: o.payerEmail,
      paidAt: o.paidAt, method: o.method, cardLastFour: o.cardLastFour, card: o.status === 'pending' ? this.payments.gateway.clientConfig() : null,
    };
  }

  private actor(request: FastifyRequest, email: string): Actor {
    return { email, ip: request.ip, userAgent: request.headers['user-agent'] };
  }
}
