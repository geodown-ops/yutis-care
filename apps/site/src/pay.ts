/*
 * /pay/?t=<token>: one payment order (付款單), paid by card through TapPay, ported from the Bazar site's payment page.
 * The card number, expiry and CVC are typed into TapPay's own fields (iframes), which hand back a one-time prime; only
 * the prime reaches Yutis Care. With 3D Secure the payer goes to their bank's page and comes back with &threeds=1.
 */
import {
  cleanCardholder, formatTwd, payErrorMessage, PAYMENT_ENDPOINT, readLink, slashDate, STATUS_LABEL, TAPPAY_SDK, validateCardholder,
  VERIFY_ATTEMPTS, VERIFY_INTERVAL_MS, type CardholderValues, type PublicPayment,
} from './pay-logic.js';

interface TPDirectSdk {
  setupSDK(appId: number, appKey: string, env: 'sandbox' | 'production'): void;
  card: {
    setup(options: unknown): void;
    onUpdate(callback: (update: { canGetPrime: boolean }) => void): void;
    getPrime(callback: (result: { status: number; msg?: string; card?: { prime: string } }) => void): void;
  };
}
declare global {
  interface Window { TPDirect?: TPDirectSdk }
}

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T | null;
const show = (id: string, visible = true) => { const el = $(id); if (el) el.hidden = !visible; };
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const { token, threeDSReturn } = readLink(location.search);
const message = $<HTMLParagraphElement>('pay-error');
const button = $<HTMLButtonElement>('pay-button');
let cardReady = false;

function setMessage(text: string | null) {
  if (!message) return;
  message.hidden = !text;
  message.textContent = text ?? '';
  if (text) message.focus();
}

function setButton(label: string, enabled: boolean) {
  if (!button) return;
  button.textContent = label;
  button.disabled = !enabled;
}

async function fetchPayment(): Promise<PublicPayment | null> {
  const res = await fetch(`${PAYMENT_ENDPOINT}/${token}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return await res.json() as PublicPayment;
}

function fill(p: PublicPayment) {
  const set = (name: string, value: string) => document.querySelectorAll(`[data-${name}]`).forEach(el => { el.textContent = value; });
  set('order-number', p.orderNumber);
  set('tenant', p.tenantName);
  set('description', p.description);
  set('amount', formatTwd(p.amount));
  set('expires', slashDate(p.expiresOn));
  set('status', STATUS_LABEL[p.status]);
  const badge = document.querySelector<HTMLElement>('[data-status]');
  if (badge) badge.dataset.tone = p.status;
}

function render(p: PublicPayment) {
  show('pay-loading', false);
  show('pay-order');
  fill(p);
  show('pay-form', p.status === 'pending' && !!p.card);
  show('pay-no-card', p.status === 'pending' && !p.card);
  show('pay-closed', p.status === 'cancelled' || p.status === 'expired');
  const closed = $('pay-closed-text');
  if (closed) closed.textContent = p.status === 'cancelled' ? '這張付款單已取消，無法再付款。' : `這張付款單的付款期限（${slashDate(p.expiresOn)}）已過。`;
  show('pay-done', p.status === 'paid');
  const how = $('pay-done-how');
  if (how) how.textContent = p.method === 'card' ? `信用卡${p.cardLastFour ? `（末四碼 ${p.cardLastFour}）` : ''}` : '匯款';
  if (p.status === 'pending' && p.card) void setUpCard(p);
}

function loadSdk(): Promise<TPDirectSdk> {
  if (window.TPDirect) return Promise.resolve(window.TPDirect);
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = TAPPAY_SDK;
    script.onload = () => window.TPDirect ? resolve(window.TPDirect) : reject(new Error('TapPay SDK missing'));
    script.onerror = () => reject(new Error('TapPay SDK failed to load'));
    document.head.append(script);
  });
}

let sdkPromise: Promise<TPDirectSdk> | null = null;

async function setUpCard(p: PublicPayment) {
  if (sdkPromise) return;
  const form = $<HTMLFormElement>('pay-form');
  if (form) {
    const input = (name: string) => form.elements.namedItem(name) as HTMLInputElement | null;
    if (input('name') && !input('name')!.value) input('name')!.value = p.payerName;
    if (input('email') && !input('email')!.value) input('email')!.value = p.payerEmail;
  }
  show('pay-sandbox', p.card!.env === 'sandbox');
  setButton('請輸入完整卡片資訊', false);
  sdkPromise = loadSdk();
  try {
    const tp = await sdkPromise;
    tp.setupSDK(p.card!.appId, p.card!.appKey, p.card!.env);
    tp.card.setup({
      fields: {
        number: { element: '#card-number', placeholder: '**** **** **** ****' },
        expirationDate: { element: '#card-expiry', placeholder: 'MM / YY' },
        ccv: { element: '#card-ccv', placeholder: '後三碼' },
      },
      styles: {
        input: { 'font-size': '16px', color: '#232629' },
        ':focus': { color: '#232629' },
        '.valid': { color: '#0E8F6E' },
        '.invalid': { color: '#C8243A' },
      },
      isMaskCreditCardNumber: true,
      maskCreditCardNumberRange: { beginIndex: 6, endIndex: 11 },
    });
    tp.card.onUpdate(update => {
      cardReady = update.canGetPrime;
      setButton(cardReady ? `確認付款 ${formatTwd(p.amount)}` : '請輸入完整卡片資訊', cardReady);
    });
  } catch {
    setMessage('刷卡元件載入失敗，請重新整理頁面。');
  }
}

function readCardholder(form: HTMLFormElement): CardholderValues {
  const data = new FormData(form);
  return { name: String(data.get('name') ?? ''), email: String(data.get('email') ?? ''), phoneNumber: String(data.get('phone') ?? '') };
}

function showCardholderErrors(errors: Partial<Record<keyof CardholderValues, string>>) {
  for (const [field, id] of [['name', 'name'], ['email', 'email'], ['phoneNumber', 'phone']] as const) {
    const slot = $(`err-${id}`);
    if (slot) slot.textContent = errors[field] ?? '';
    const input = document.querySelector<HTMLInputElement>(`#pay-form [name=${id}]`);
    if (errors[field]) input?.setAttribute('aria-invalid', 'true');
    else input?.removeAttribute('aria-invalid');
  }
}

async function pay(form: HTMLFormElement) {
  setMessage(null);
  const cardholder = readCardholder(form);
  const errors = validateCardholder(cardholder);
  showCardholderErrors(errors);
  if (Object.keys(errors).length) return;
  const tp = await sdkPromise;
  if (!tp || !cardReady) return;
  setButton('交易處理中，請勿關閉頁面…', false);
  tp.card.getPrime(async result => {
    if (result.status !== 0 || !result.card) {
      setMessage(`卡片資料驗證失敗：${result.msg || '請確認卡號、有效期限與安全碼'}`);
      setButton('確認付款', true);
      return;
    }
    try {
      const res = await fetch(`${PAYMENT_ENDPOINT}/${token}/pay`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ prime: result.card.prime, cardholder: cleanCardholder(cardholder) }),
      });
      const body = await res.json().catch(() => null) as { result?: string; paymentUrl?: string; payment?: PublicPayment } | null;
      if (res.ok && body?.result === 'verify' && body.paymentUrl) {
        setButton('前往銀行 3D 驗證頁面…', false);
        location.href = body.paymentUrl;
        return;
      }
      if (res.ok && body?.payment) {
        render(body.payment);
        return;
      }
      setMessage(payErrorMessage(res.status, body));
    } catch {
      setMessage(payErrorMessage(0, null));
    }
    setButton('確認付款', cardReady);
  });
}

/** Back from the bank: ask (TapPay's records are checked by the API) a few times before giving up. */
async function verifyReturn(): Promise<PublicPayment | null> {
  const status = $('pay-loading-text');
  if (status) status.textContent = '正在確認 3D 驗證的付款結果，請稍候…';
  let latest: PublicPayment | null = null;
  for (let i = 0; i < VERIFY_ATTEMPTS; i++) {
    try {
      const res = await fetch(`${PAYMENT_ENDPOINT}/${token}/verify`, { method: 'POST' });
      if (res.status === 404) return null;
      if (res.ok) {
        latest = await res.json() as PublicPayment;
        if (latest.status !== 'pending') return latest;
      }
    } catch { /* try again */ }
    await sleep(VERIFY_INTERVAL_MS);
  }
  return latest;
}

async function start() {
  if (!token) {
    show('pay-loading', false);
    show('pay-missing');
    return;
  }
  const form = $<HTMLFormElement>('pay-form');
  form?.addEventListener('submit', e => { e.preventDefault(); void pay(form); });
  try {
    let payment = threeDSReturn ? await verifyReturn() : null;
    const stillPending = threeDSReturn && payment?.status === 'pending';
    payment ??= await fetchPayment();
    if (!payment) {
      show('pay-loading', false);
      show('pay-missing');
      return;
    }
    render(payment);
    if (stillPending) setMessage('尚未收到 3D 驗證的付款結果。若您已完成驗證，請稍候重新整理本頁；若驗證失敗或中斷，可以重新付款。');
  } catch {
    show('pay-loading', false);
    show('pay-missing');
    const missing = $('pay-missing-text');
    if (missing) missing.textContent = '付款單暫時無法載入，請稍後重新整理頁面。';
  }
}

void start();
