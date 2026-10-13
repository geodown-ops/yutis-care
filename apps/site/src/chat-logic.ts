/* The site chat window's rules, without the DOM: what a visitor must fill in, the requests it sends, how new messages
 * join the ones on screen, and how the platform API's answers read. The platform API checks the same limits. */
import { CHAT_MESSAGE_MAX, CHAT_NAME_MAX, type ChatAuthor } from '@yutis/domain/chat';
import { CONTACT_EMAIL } from './contact.js';

export { CHAT_MESSAGE_MAX, CHAT_POLL_MS } from '@yutis/domain/chat';

/** The platform API, served on the site's own host. */
export const CHAT_START_ENDPOINT = '/platform-api/public/chat/conversations';
export const CHAT_ENDPOINT = '/platform-api/public/chat/conversation';
export const CHAT_TOKEN_HEADER = 'X-Chat-Token';
/** Where the browser keeps the visitor's token, so the conversation survives moving between pages. */
export const CHAT_STORAGE_KEY = 'yutis-chat-token';
/** While the window is folded it still checks now and then, to show a badge when staff answer. */
export const CHAT_IDLE_POLL_MS = 20_000;
/**
 * New messages are asked for from a little before the newest one on screen: a reply whose transaction started earlier
 * can commit after a later message. The overlap comes back twice and is kept once, by id.
 */
const OVERLAP_MS = 60_000;

export interface ChatMessage {
  id: string;
  author: ChatAuthor;
  body: string;
  createdAt: string;
}

export interface ChatStartValues {
  name: string;
  email: string;
  companyName: string;
  message: string;
  consent: boolean;
  /** Honeypot. */
  website: string;
}

export type ChatStartField = 'name' | 'email' | 'companyName' | 'message' | 'consent';
export type ChatStartErrors = Partial<Record<ChatStartField, string>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateChatStart(v: ChatStartValues): ChatStartErrors {
  const errors: ChatStartErrors = {};
  const name = v.name.trim();
  if (!name) errors.name = '請填寫怎麼稱呼您';
  else if (name.length > CHAT_NAME_MAX) errors.name = `稱呼請在 ${CHAT_NAME_MAX} 字以內`;
  const email = v.email.trim();
  if (email && (!EMAIL.test(email) || email.length > 254)) errors.email = 'Email 格式不正確';
  if (v.companyName.trim().length > CHAT_NAME_MAX) errors.companyName = `公司名稱請在 ${CHAT_NAME_MAX} 字以內`;
  const messageError = validateChatMessage(v.message);
  if (messageError) errors.message = messageError;
  if (!v.consent) errors.consent = '請先閱讀並同意隱私權政策';
  return errors;
}

/** Undefined when the message can be sent. */
export function validateChatMessage(text: string): string | undefined {
  const t = text.trim();
  if (!t) return '請輸入訊息';
  if (t.length > CHAT_MESSAGE_MAX) return `訊息請在 ${CHAT_MESSAGE_MAX} 字以內`;
  return undefined;
}

/** The JSON body that starts a chat. Call only with values that passed validateChatStart. */
export function buildChatStartRequest(v: ChatStartValues, page: string, elapsedMs: number) {
  return {
    name: v.name.trim(),
    email: v.email.trim().toLowerCase() || null,
    companyName: v.companyName.trim() || null,
    message: v.message.trim(),
    page: page.slice(0, 200) || '/',
    consent: true as const,
    website: v.website,
    elapsedMs: Math.max(0, Math.round(elapsedMs)),
  };
}

/** The messages on screen plus new ones: each once, oldest first. */
export function mergeMessages(shown: readonly ChatMessage[], incoming: readonly ChatMessage[]): ChatMessage[] {
  const byId = new Map(shown.map(m => [m.id, m]));
  for (const m of incoming) byId.set(m.id, m);
  return [...byId.values()].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
}

/** The `after` to ask with, given the messages on screen; undefined asks for the whole conversation. */
export function pollAfter(shown: readonly ChatMessage[]): string | undefined {
  const last = shown.at(-1);
  return last ? new Date(Date.parse(last.createdAt) - OVERLAP_MS).toISOString() : undefined;
}

/** Messages from Yutis Care among `incoming` that are not on screen yet: what the folded window's badge counts. */
export function countNewReplies(shown: readonly ChatMessage[], incoming: readonly ChatMessage[]): number {
  const known = new Set(shown.map(m => m.id));
  return incoming.filter(m => m.author !== 'visitor' && !known.has(m.id)).length;
}

/** HH:mm in Taiwan time. */
export function formatChatTime(iso: string): string {
  return new Intl.DateTimeFormat('zh-TW', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: 'Asia/Taipei' }).format(new Date(iso));
}

export const authorLabel = (author: ChatAuthor) => (author === 'visitor' ? '您' : author === 'staff' ? 'Yutis Care 客服' : '系統訊息');

export type ChatOutcome = { kind: 'ok' } | { kind: 'expired' } | { kind: 'error'; message: string };

/** What an answer from the platform API means for the visitor. `status` 0 means the request never got an answer. */
export function interpretChatResponse(status: number, body: unknown): ChatOutcome {
  if (status >= 200 && status < 300) return { kind: 'ok' };
  const code = typeof body === 'object' && body !== null && 'code' in body ? (body as { code: unknown }).code : undefined;
  if (status === 401 && code === 'chat_token_invalid') return { kind: 'expired' };
  if (status === 429) return { kind: 'error', message: '訊息送得太快了，請稍候再試。' };
  if (status === 400) return { kind: 'error', message: '內容無法送出，請檢查後再試。' };
  return { kind: 'error', message: `目前無法連線，請稍後再試，或直接來信 ${CONTACT_EMAIL}。` };
}
