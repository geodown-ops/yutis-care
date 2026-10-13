/* Online chat emails (線上客服). Plain text; the visitor's name and what they wrote, nothing else. */
import type { Mail } from '../core/mail.js';

export interface ChatVisitor {
  id: string;
  visitorName: string;
  visitorEmail: string | null;
  companyName: string | null;
}

const who = (c: ChatVisitor) => (c.companyName ? `${c.visitorName}（${c.companyName}）` : c.visitorName);

/** Longer messages are cut in the email; the whole message is in the platform admin. */
const excerpt = (text: string, max = 500) => (text.length > max ? `${text.slice(0, max)}…` : text);

/** To platform staff: a visitor started a chat, or wrote again in one that was closed. */
export function chatToAnswer(c: ChatVisitor, message: { id: string; body: string }, to: string, baseDomain: string, reopened: boolean): Mail {
  return {
    to,
    subject: reopened ? `線上客服：${who(c)} 又留言了` : `線上客服新對話：${who(c)}`,
    text: [
      `訪客：${who(c)}`,
      `Email：${c.visitorEmail ?? '未留'}`,
      '',
      excerpt(message.body),
      '',
      `請到平台管理後台回覆：https://admin.${baseDomain}/live-chat?c=${c.id}`,
    ].join('\n'),
    idempotencyKey: `chat-notify-${message.id}-${to}`,
  };
}

/** To the visitor, when they had left the page: what staff answered and how to carry on. */
export function staffReplied(c: ChatVisitor & { visitorEmail: string }, message: { id: string; body: string }, baseDomain: string, contactEmail: string): Mail {
  return {
    to: c.visitorEmail,
    subject: 'Yutis Care 客服回覆了您的訊息',
    text: [
      `${c.visitorName} 您好：`,
      '',
      '您在 Yutis Care 官網線上客服的留言，我們回覆如下：',
      '',
      excerpt(message.body, 2000),
      '',
      `要繼續對話，請用同一個瀏覽器回到 https://${baseDomain}/ 並開啟右下角的線上客服，或寫信到 ${contactEmail}。`,
      '',
      'Yutis Care',
    ].join('\n'),
    idempotencyKey: `chat-reply-${message.id}`,
  };
}
