/* The payment page's rules, without the DOM, so they can be tested. The platform API's public payment routes answer it. */

export const PAYMENT_ENDPOINT = '/platform-api/public/payments';
/** TapPay's Direct Pay SDK, the version the Bazar site uses. */
export const TAPPAY_SDK = 'https://js.tappaysdk.com/sdk/tpdirect/v5.24.0';

export type PaymentStatus = 'pending' | 'paid' | 'cancelled' | 'expired';

/** GET /platform-api/public/payments/{token} */
export interface PublicPayment {
  orderNumber: string;
  tenantName: string;
  description: string;
  amount: number;
  status: PaymentStatus;
  expiresOn: string;
  payerName: string;
  payerEmail: string;
  paidAt: string | null;
  method: string | null;
  cardLastFour: string | null;
  card: { appId: number; appKey: string; env: 'sandbox' | 'production' } | null;
}

/** The link's token (?t=…), and whether the payer is back from their bank's 3D Secure page (&threeds=1). */
export function readLink(search: string): { token: string | null; threeDSReturn: boolean } {
  const params = new URLSearchParams(search);
  const token = params.get('t');
  return { token: token && /^[A-Za-z0-9_-]{20,64}$/.test(token) ? token : null, threeDSReturn: params.get('threeds') === '1' };
}

export const formatTwd = (amount: number) => `NT$${amount.toLocaleString('en-US')}`;
export const slashDate = (isoDate: string) => isoDate.replaceAll('-', '/');

export const STATUS_LABEL: Record<PaymentStatus, string> = { pending: '待付款', paid: '已付款', cancelled: '已取消', expired: '已逾期' };

export interface CardholderValues { name: string; email: string; phoneNumber: string }
export type CardholderErrors = Partial<Record<keyof CardholderValues, string>>;

/** Same rules as the API (PayRequest): TapPay wants a name, an email and a phone number for the cardholder. */
export function validateCardholder(v: CardholderValues): CardholderErrors {
  const errors: CardholderErrors = {};
  if (!v.name.trim()) errors.name = '請填寫持卡人姓名';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errors.email = '請填寫有效的 Email';
  if (!/^(\+?\d{8,15}|09\d{8})$/.test(v.phoneNumber.replace(/[\s-]/g, ''))) errors.phoneNumber = '請填寫手機號碼，例如 0912345678';
  return errors;
}

export const cleanCardholder = (v: CardholderValues): CardholderValues =>
  ({ name: v.name.trim(), email: v.email.trim(), phoneNumber: v.phoneNumber.replace(/[\s-]/g, '') });

const codeOf = (body: unknown) => typeof body === 'object' && body !== null && 'code' in body ? (body as { code: unknown }).code : undefined;

/** What to tell the payer when POST …/pay did not succeed. */
export function payErrorMessage(status: number, body: unknown): string {
  const code = codeOf(body);
  if (status === 402) return '銀行沒有核准這筆交易，請確認卡號、有效期限與安全碼，或改用其他信用卡。';
  if (code === 'already_paid') return '這張付款單已經付款完成，請重新整理頁面。';
  if (code === 'order_cancelled') return '這張付款單已取消，無法付款。';
  if (code === 'order_expired') return '這張付款單已超過付款期限，請與我們聯絡。';
  if (code === 'payment_in_progress') return '這張付款單正在付款中，請稍候再重新整理頁面，不要重複付款。';
  if (status === 400) return '持卡人資料有誤，請檢查後再試。';
  if (status === 503) return '目前無法線上刷卡，請與我們聯絡。';
  return '付款服務暫時沒有回應。為避免重複扣款，請先重新整理頁面確認付款狀態，再決定是否重試。';
}

/** After 3D Secure: ask this many times, this far apart, before saying the result has not arrived. */
export const VERIFY_ATTEMPTS = 5;
export const VERIFY_INTERVAL_MS = 2000;
