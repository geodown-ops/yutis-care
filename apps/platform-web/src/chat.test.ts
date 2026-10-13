import { describe, expect, it } from 'vitest';
import { lastLine, matchesConversation, unreadTotal, visibleConversations, visitorLabel } from './chat';

const conv = (over: Record<string, unknown>) => ({
  status: 'open' as const, unread: 0, lastMessageAt: '2026-10-13T01:00:00Z', visitorName: '林小姐', companyName: null as string | null,
  visitorEmail: null as string | null, lastMessage: '你好' as string | null, lastAuthor: 'visitor' as const, ...over,
});

describe('site chats', () => {
  it('adds up unread visitor messages for the menu badge', () => {
    expect(unreadTotal(undefined)).toBe(0);
    expect(unreadTotal([conv({ unread: 2 }), conv({ unread: 1 })])).toBe(3);
  });

  it('searches name, company, email and the last message', () => {
    const c = conv({ companyName: '大南汽車', visitorEmail: 'lin@corp.tw', lastMessage: '地端部署' });
    expect(['林', '大南', 'CORP', '地端', ''].every(q => matchesConversation(c, q))).toBe(true);
    expect(matchesConversation(c, '台積')).toBe(false);
  });

  it('lists unread ones first, then the most recent, for the chosen status', () => {
    const list = [
      conv({ visitorName: 'old', lastMessageAt: '2026-10-12T01:00:00Z' }),
      conv({ visitorName: 'new', lastMessageAt: '2026-10-13T02:00:00Z' }),
      conv({ visitorName: 'waiting', lastMessageAt: '2026-10-11T01:00:00Z', unread: 1 }),
      conv({ visitorName: 'done', status: 'closed' }),
    ];
    expect(visibleConversations(list, 'open', '').map(c => c.visitorName)).toEqual(['waiting', 'new', 'old']);
    expect(visibleConversations(list, 'closed', '').map(c => c.visitorName)).toEqual(['done']);
    expect(visibleConversations(list, 'all', '')).toHaveLength(4);
  });

  it('labels the visitor and the last line', () => {
    expect(visitorLabel(conv({ companyName: '大南汽車' }))).toBe('林小姐（大南汽車）');
    expect(lastLine(conv({ lastAuthor: 'staff', lastMessage: '好的' }))).toBe('客服：好的');
    expect(lastLine(conv({ lastMessage: null }))).toBe('');
  });
});
