import { describe, expect, it } from 'vitest';
import {
  buildChatStartRequest,
  countNewReplies,
  formatChatTime,
  interpretChatResponse,
  mergeMessages,
  pollAfter,
  validateChatMessage,
  validateChatStart,
  type ChatMessage,
  type ChatStartValues,
} from '../src/chat-logic.js';

const valid: ChatStartValues = { name: ' 林小姐 ', email: ' Lin@Corp.TW ', companyName: ' 大南汽車 ', message: ' 可以地端部署嗎？ ', consent: true, website: '' };
const msg = (id: string, createdAt: string, author: ChatMessage['author'] = 'visitor'): ChatMessage => ({ id, author, body: id, createdAt });

describe('validateChatStart', () => {
  it('needs a name, a message and consent; email and company are optional', () => {
    expect(validateChatStart(valid)).toEqual({});
    expect(validateChatStart({ ...valid, email: '', companyName: '' })).toEqual({});
    expect(Object.keys(validateChatStart({ ...valid, name: ' ', message: '', consent: false })).sort()).toEqual(['consent', 'message', 'name']);
  });

  it('checks the email only when given, and the lengths the API accepts', () => {
    expect(validateChatStart({ ...valid, email: 'not-mail' }).email).toBe('Email 格式不正確');
    expect(validateChatStart({ ...valid, name: '名'.repeat(51) }).name).toMatch(/50 字/);
    expect(validateChatMessage('x'.repeat(2001))).toMatch(/2000 字/);
    expect(validateChatMessage('  ')).toBe('請輸入訊息');
  });
});

describe('buildChatStartRequest', () => {
  it('trims what was typed and leaves empty optional fields out', () => {
    expect(buildChatStartRequest(valid, '/trial/', 5234.6)).toEqual({
      name: '林小姐', email: 'lin@corp.tw', companyName: '大南汽車', message: '可以地端部署嗎？', page: '/trial/', consent: true, website: '', elapsedMs: 5235,
    });
    expect(buildChatStartRequest({ ...valid, email: ' ', companyName: '' }, '', 0)).toMatchObject({ email: null, companyName: null, page: '/' });
  });
});

describe('messages', () => {
  const a = msg('a', '2026-10-13T01:00:00.000Z'), b = msg('b', '2026-10-13T01:00:05.000Z', 'staff'), c = msg('c', '2026-10-13T01:00:09.000Z');

  it('keeps each message once, oldest first', () => {
    expect(mergeMessages([b, a], [b, c]).map(m => m.id)).toEqual(['a', 'b', 'c']);
  });

  it('asks from a minute before the newest message, or for everything when there is none', () => {
    expect(pollAfter([])).toBeUndefined();
    expect(pollAfter([a, c])).toBe('2026-10-13T00:59:09.000Z');
  });

  it('counts only new replies from Yutis Care for the badge', () => {
    expect(countNewReplies([a], [a, b, c])).toBe(1);
    expect(countNewReplies([a, b], [b])).toBe(0);
  });

  it('shows times in Taiwan time', () => {
    expect(formatChatTime('2026-10-13T01:05:00.000Z')).toBe('09:05');
  });
});

describe('interpretChatResponse', () => {
  it('reads the API answers', () => {
    expect(interpretChatResponse(201, {})).toEqual({ kind: 'ok' });
    expect(interpretChatResponse(401, { code: 'chat_token_invalid' })).toEqual({ kind: 'expired' });
    expect(interpretChatResponse(429, null)).toMatchObject({ kind: 'error', message: expect.stringContaining('太快') });
    expect(interpretChatResponse(0, null)).toMatchObject({ kind: 'error', message: expect.stringContaining('care@yutis.net') });
  });
});
