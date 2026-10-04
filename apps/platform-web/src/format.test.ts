import { describe, expect, it } from 'vitest';
import { formatDate, formatDateTime, formatMonth, fromLocalInput, monthInTaipei, recentMonths, toLocalInput, todayInTaipei } from './format';

describe('Taiwan time', () => {
  it('rolls over at midnight in Taiwan, not UTC', () => {
    expect(todayInTaipei(new Date('2026-10-03T15:59:00Z'))).toBe('2026-10-03');
    expect(todayInTaipei(new Date('2026-10-03T16:00:00Z'))).toBe('2026-10-04');
    expect(monthInTaipei(new Date('2026-09-30T16:30:00Z'))).toBe('2026-10');
  });

  it('formats dates and timestamps', () => {
    expect(formatDate('2026-10-04')).toBe('2026/10/04');
    expect(formatDate('2026-10-03T17:30:00.000Z')).toBe('2026/10/04');
    expect(formatDateTime('2026-10-04T01:05:00.000Z')).toBe('2026/10/04 09:05');
    expect(formatDate(null)).toBe('—');
    expect(formatDateTime(undefined)).toBe('—');
  });

  it('round-trips datetime-local values through the API format', () => {
    expect(toLocalInput('2026-10-04T01:05:00.000Z')).toBe('2026-10-04T09:05');
    expect(fromLocalInput('2026-10-04T09:05')).toBe('2026-10-04T09:05:00+08:00');
    expect(new Date(fromLocalInput('2026-10-04T09:05')).toISOString()).toBe('2026-10-04T01:05:00.000Z');
  });
});

describe('months', () => {
  it('lists recent months newest first, across the year boundary', () => {
    expect(recentMonths('2026-02', 4)).toEqual(['2026-02', '2026-01', '2025-12', '2025-11']);
  });

  it('reads as a Chinese month', () => {
    expect(formatMonth('2026-03')).toBe('2026 年 3 月');
  });
});
