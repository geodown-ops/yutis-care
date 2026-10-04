import { describe, expect, it } from 'vitest';
import {
  ackState, adviceByDate, byNewest, defaultManager, isNew, managerOptions, maternalNoticeText, NOTICE_MAX, noticeText, sentNoticeStatus, workloadNoticeText,
} from './advice';

const managers = [
  { id: 'm1', name: '簡志遠', email: 'jian@example.test', departmentIds: ['d2'] },
  { id: 'm2', name: '周課長', email: 'chou@example.test', departmentIds: ['d1'] },
  { id: 'm3', name: '溫雅惠', email: 'wen@example.test', departmentIds: [] },
];

describe('notice recipient', () => {
  it('preselects the department manager only when there is exactly one', () => {
    expect(defaultManager(managers, 'd1')).toBe('m2');
    expect(defaultManager(managers, 'd9')).toBeNull();
    expect(defaultManager(managers, null)).toBeNull();
    expect(defaultManager([...managers, { id: 'm4', name: '另一位', email: 'other@example.test', departmentIds: ['d1'] }], 'd1')).toBeNull();
  });

  it('lists the department manager first but offers everyone', () => {
    const opts = managerOptions(managers, 'd1');
    expect(opts[0]).toEqual({ value: 'm2', label: '周課長（本部門主管）' });
    expect(opts.map(o => o.value).sort()).toEqual(['m1', 'm2', 'm3']);
  });

  it('shows a sent notice as unread under the chosen manager', () => {
    expect(sentNoticeStatus({ id: 'n1', sentAt: '2026-10-04T01:00:00Z' }, managers[1]!))
      .toEqual({ id: 'n1', managerUserId: 'm2', managerName: '周課長', sentAt: '2026-10-04T01:00:00Z', readAt: null });
  });
});

describe('prefilled advice', () => {
  it('words a maternal interview like the work advice HR sees', () => {
    expect(maternalNoticeText({ fitAdvice: '可繼續從事工作，但須考量下列條件限制', agreedArrangement: '調整職務', limits: ['限制夜班'] }))
      .toBe('可繼續從事工作，但須考量下列條件限制；調整職務\n工作限制：限制夜班');
    expect(maternalNoticeText({ fitAdvice: null, agreedArrangement: null, limits: [] })).toBe('');
  });

  it('words a workload interview with its measures and period', () => {
    expect(workloadNoticeText({ fitness: '工作限制', restrictions: ['避免單獨作業'], suggestion: ' 轉介心臟內科 ', adjustHours: '限制加班', changeWork: '', period: '3 個月' }))
      .toBe('工作限制；轉介心臟內科；措施期間：3 個月\n工作限制：避免單獨作業、限制加班');
    expect(workloadNoticeText(null)).toBe('');
  });
});

describe('manager notices', () => {
  it('sends the advice and restrictions only', () => {
    expect(noticeText({ advice: ' 可繼續目前工作 ', restrictions: ['不安排夜班', '避免搬運'] })).toBe('可繼續目前工作\n工作限制：不安排夜班、避免搬運');
    expect(noticeText({ advice: '維持原工作', restrictions: [] })).toBe('維持原工作');
    expect(noticeText({ advice: 'x'.repeat(2000), restrictions: [] })).toHaveLength(NOTICE_MAX);
  });

  it('treats notices without a read time as new', () => {
    expect(isNew({ readAt: null })).toBe(true);
    expect(isNew({ readAt: '2026-10-01T02:00:00Z' })).toBe(false);
  });

  it('sorts notices and advice newest first', () => {
    const notices = [{ sentAt: '2026-09-01T00:00:00Z' }, { sentAt: '2026-10-01T00:00:00Z' }];
    expect([...notices].sort(byNewest)[0]!.sentAt).toBe('2026-10-01T00:00:00Z');
    expect([{ on: null }, { on: '2026-09-01' }, { on: '2026-10-01' }].sort(adviceByDate).map(a => a.on)).toEqual(['2026-10-01', '2026-09-01', null]);
  });
});

describe('employee confirmation', () => {
  it('reads confirmed before sent', () => {
    expect(ackState({ sentAt: null, confirmedAt: null })).toBe('unsent');
    expect(ackState({ sentAt: '2026-10-04T01:00:00Z', confirmedAt: null })).toBe('sent');
    // Confirmed in the portal without a link ever being sent.
    expect(ackState({ sentAt: null, confirmedAt: '2026-10-04T01:00:00Z' })).toBe('confirmed');
  });
});
