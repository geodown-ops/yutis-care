import { describe, expect, it } from 'vitest';
import type { Announcement } from './api';
import { announcementBody, announcementPhase, announcementProblems, announcementToForm, emptyAnnouncementForm } from './announcements';
import { platformUserProblems } from './forms';

const now = new Date('2026-10-04T04:00:00Z');

const announcement = (over: Partial<Announcement> = {}): Announcement => ({
  id: crypto.randomUUID(), tenantId: null, kind: 'maintenance', title: '系統維護', body: '10/10 凌晨維護。',
  publishAt: '2026-10-04T00:00:00.000Z', expiresAt: '2026-10-10T16:00:00.000Z', ...over,
});

describe('announcement phase', () => {
  it('is scheduled before publishAt, live until expiresAt, then expired', () => {
    expect(announcementPhase(announcement({ publishAt: '2026-10-05T00:00:00Z' }), now)).toBe('scheduled');
    expect(announcementPhase(announcement(), now)).toBe('live');
    expect(announcementPhase(announcement({ expiresAt: null }), now)).toBe('live');
    expect(announcementPhase(announcement({ expiresAt: '2026-10-04T04:00:00Z' }), now)).toBe('expired');
  });
});

describe('announcement form', () => {
  it('starts as a notice to every tenant, published now', () => {
    expect(emptyAnnouncementForm(now)).toEqual({ tenantId: '', kind: 'notice', title: '', body: '', publishAt: '2026-10-04T12:00', expiresAt: '' });
  });

  it('round-trips an announcement in Taiwan time', () => {
    const a = announcement({ tenantId: '8bcf1ce0-8ab3-4b2e-925e-950a2c289344' });
    const form = announcementToForm(a);
    expect(form.publishAt).toBe('2026-10-04T08:00');
    expect(form.expiresAt).toBe('2026-10-11T00:00');
    const body = announcementBody(form);
    expect(body).toEqual({
      tenantId: a.tenantId, kind: 'maintenance', title: '系統維護', body: '10/10 凌晨維護。',
      publishAt: '2026-10-04T08:00:00+08:00', expiresAt: '2026-10-11T00:00:00+08:00',
    });
    expect(Date.parse(body.publishAt)).toBe(Date.parse(a.publishAt));
  });

  it('sends every tenant and no expiry as null', () => {
    expect(announcementBody({ ...emptyAnnouncementForm(now), title: ' 標題 ', body: ' 內容 ' }))
      .toMatchObject({ tenantId: null, expiresAt: null, title: '標題', body: '內容' });
  });

  it('checks required fields, the API limits and the expiry order', () => {
    const f = { ...emptyAnnouncementForm(now), title: '標題', body: '內容' };
    expect(announcementProblems(f)).toEqual({});
    expect(Object.keys(announcementProblems(emptyAnnouncementForm(now))).sort()).toEqual(['body', 'title']);
    expect(announcementProblems({ ...f, title: 'x'.repeat(201) }).title).toBe('標題最多 200 字');
    expect(announcementProblems({ ...f, expiresAt: f.publishAt }).expiresAt).toBe('下架時間要晚於發布時間');
  });
});

describe('platform user form', () => {
  it('needs an email only when adding someone', () => {
    const f = { email: '', name: '王小明', role: '客服' as const, active: true };
    expect(platformUserProblems(f, true)).toEqual({ email: '請輸入 Email' });
    expect(platformUserProblems(f, false)).toEqual({});
    expect(platformUserProblems({ ...f, email: 'wang@yutis.test', name: ' ' }, true)).toEqual({ name: '請輸入姓名' });
  });
});
