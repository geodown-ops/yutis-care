/* Payment order emails to the payer. Plain text; the order and the company only, never anything about employees. */
import type { Mail } from '../core/mail.js';

export interface OrderForMail {
  id: string;
  orderNumber: string;
  amount: number;
  description: string;
  payerName: string;
  payerEmail: string;
  expiresOn: string;
}

const twd = (amount: number) => `NT$${amount.toLocaleString('en-US')}`;
const slashDate = (isoDate: string) => isoDate.replaceAll('-', '/');

/** The payment link (付款通知). */
export function paymentRequest(o: OrderForMail, tenantName: string, payUrl: string, siteUrl: string): Mail {
  return {
    to: o.payerEmail,
    subject: `${tenantName} Yutis Care 付款通知（${o.orderNumber}）`,
    text: [
      `${o.payerName} 您好：`,
      '',
      `以下是 ${tenantName} 的 Yutis Care 付款單，請在 ${slashDate(o.expiresOn)} 前完成付款。`,
      '',
      `付款單號：${o.orderNumber}`,
      `項目：${o.description}`,
      `金額：${twd(o.amount)}`,
      '',
      `線上刷卡付款：${payUrl}`,
      '',
      '卡號由金流服務商 TapPay 直接處理，不會經過 Yutis Care。如需改用匯款或有任何問題，請寫信到 care@yutis.net。',
      '',
      'Yutis Care',
      siteUrl,
    ].join('\n'),
    idempotencyKey: `payment-request-${o.id}-${Date.now()}`,
  };
}

/** Payment received (付款完成). */
export function paymentReceived(
  o: OrderForMail & { method: string | null; cardLastFour: string | null; recTradeId: string | null; paidAt: Date | null },
  tenantName: string,
  siteUrl: string,
): Mail {
  const how = o.method === 'card'
    ? `信用卡${o.cardLastFour ? `（末四碼 ${o.cardLastFour}）` : ''}${o.recTradeId ? `，交易編號 ${o.recTradeId}` : ''}`
    : '匯款';
  return {
    to: o.payerEmail,
    subject: `Yutis Care 付款完成（${o.orderNumber}）`,
    text: [
      `${o.payerName} 您好：`,
      '',
      `我們已收到 ${tenantName} 的付款，謝謝。`,
      '',
      `付款單號：${o.orderNumber}`,
      `項目：${o.description}`,
      `金額：${twd(o.amount)}`,
      `付款方式：${how}`,
      ...(o.paidAt ? [`付款時間：${o.paidAt.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', hour12: false })}`] : []),
      '',
      'Yutis Care',
      siteUrl,
    ].join('\n'),
    idempotencyKey: `payment-received-${o.id}`,
  };
}
