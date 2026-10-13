/* Site chats (線上客服) in the platform admin: what the list shows and how it is searched. */
import type { ChatConversation, ChatStatus } from './api';

export type ChatFilter = ChatStatus | 'all';

/** Visitor messages nobody has read yet, over the given conversations (the menu badge). */
export const unreadTotal = (conversations: readonly Pick<ChatConversation, 'unread' | 'status'>[] | undefined) =>
  (conversations ?? []).reduce((n, c) => n + c.unread, 0);

/** Name, company, email or the last message contains the query (case-insensitive). */
export function matchesConversation(c: Pick<ChatConversation, 'visitorName' | 'companyName' | 'visitorEmail' | 'lastMessage'>, query: string): boolean {
  const q = query.trim().toLowerCase();
  return !q || [c.visitorName, c.companyName, c.visitorEmail, c.lastMessage].some(v => v?.toLowerCase().includes(q));
}

/** What the list shows for the filter: open ones with unread messages first, then the most recent. */
export function visibleConversations<C extends Pick<ChatConversation, 'status' | 'unread' | 'lastMessageAt' | 'visitorName' | 'companyName' | 'visitorEmail' | 'lastMessage'>>(
  conversations: readonly C[], filter: ChatFilter, query: string,
): C[] {
  return conversations
    .filter(c => (filter === 'all' || c.status === filter) && matchesConversation(c, query))
    .sort((a, b) => Number(b.unread > 0) - Number(a.unread > 0) || Date.parse(b.lastMessageAt) - Date.parse(a.lastMessageAt));
}

/** 林小姐（大南汽車） */
export const visitorLabel = (c: Pick<ChatConversation, 'visitorName' | 'companyName'>) => (c.companyName ? `${c.visitorName}（${c.companyName}）` : c.visitorName);

/** The last message as the list shows it, with who wrote it when that was not the visitor. */
export function lastLine(c: Pick<ChatConversation, 'lastMessage' | 'lastAuthor'>): string {
  if (!c.lastMessage) return '';
  return c.lastAuthor === 'staff' ? `客服：${c.lastMessage}` : c.lastMessage;
}
