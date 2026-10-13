/* Online customer chat (線上客服) on the marketing site care.yutis.net. Shared by the site's chat window and the platform
 * API, so both accept the same input. Visitors are prospective customers: no health data belongs in a chat. */

/** Longest single message, in characters. */
export const CHAT_MESSAGE_MAX = 2000;
/** Longest visitor name and company name. */
export const CHAT_NAME_MAX = 50;
/** How often the open chat window asks for new messages. */
export const CHAT_POLL_MS = 4_000;
/** Conversations with no message for this long are deleted (隱私權政策). */
export const CHAT_KEEP_DAYS = 365;

export type ChatAuthor = 'visitor' | 'staff' | 'system';
