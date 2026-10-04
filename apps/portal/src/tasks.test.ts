import { describe, expect, it } from 'vitest';
import { formatDate } from './dates';
import { TASK_ROUTES, taskLink, taskTitle, type TaskKind } from './tasks';

describe('tasks', () => {
  it('opens each kind of task in its own flow', () => {
    const kinds: TaskKind[] = ['nmq', 'cbi', 'overload', 'acknowledgement'];
    for (const kind of kinds) expect(taskLink({ kind, id: 'a1' })).toEqual({ to: `/tasks/${kind}/$id`, params: { id: 'a1' } });
    // Every flow sits under /tasks/, where the tab bar is hidden.
    expect(Object.values(TASK_ROUTES).every(r => r.startsWith('/tasks/'))).toBe(true);
  });

  it('uses the API title in Chinese and the kind of task in other languages', () => {
    const task = { kind: 'nmq' as const, title: '肌肉骨骼症狀調查：2026 下半年' };
    expect(taskTitle(task, 'zh', k => k)).toBe('肌肉骨骼症狀調查：2026 下半年');
    expect(taskTitle(task, 'vi', k => `kind:${k}`)).toBe('kind:nmq');
  });
});

describe('dates', () => {
  it('writes calendar dates and timestamps in Taiwan time', () => {
    expect(formatDate('2026-10-10', 'zh')).toBe('2026/10/10');
    expect(formatDate('2026-10-10', 'zh', { year: false })).toBe('10/10');
    // 20:00 UTC on 31 Aug is already 1 Sep in Taiwan.
    expect(formatDate('2026-08-31T20:00:00.000Z', 'zh')).toBe('2026/9/1');
    expect(formatDate('2026-10-10', 'th')).toContain('2026');
    expect(formatDate('not a date', 'en')).toBe('not a date');
  });
});
