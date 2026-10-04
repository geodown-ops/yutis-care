import { describe, expect, it } from 'vitest';
import { cellText, chartOf, exportState, groupCatalogue, pickReport, pollInterval, type ExportJob, type ReportType } from './report';

const TYPES: ReportType[] = [
  { kind: 'health', type: 'grade', title: '健管級數占比分析' },
  { kind: 'health', type: 'trend', title: '健管級數年度變化（母群體相同）' },
  { kind: 'wl', type: 'cvd', title: '十年內心血管疾病' },
  { kind: 'ergo', type: 'part', title: '部位異常占比比較' },
];

describe('catalogue', () => {
  it('groups by kind in the API order', () => {
    const g = groupCatalogue(TYPES);
    expect(g.map(x => [x.kind, x.label, x.types.length])).toEqual([['health', '健康管理', 2], ['wl', '異常工作負荷', 1], ['ergo', '人因性危害', 1]]);
  });

  it('falls back to the first report of the kind, then the first overall', () => {
    const g = groupCatalogue(TYPES);
    expect(pickReport(g, 'health', 'trend')?.type).toBe('trend');
    expect(pickReport(g, 'wl', 'nope')?.type).toBe('cvd');
    expect(pickReport(g, undefined, undefined)?.type).toBe('grade');
    expect(pickReport(g, 'bogus')?.type).toBe('grade');
    expect(pickReport([], 'health')).toBeUndefined();
  });
});

describe('chartOf', () => {
  it('draws the count column, not percentages', () => {
    const c = chartOf({ columns: ['最大級', '人數', '百分比'], rows: [['第 1 級', 10, '71.4%'], ['第 3 級', null, null]], summary: [{ label: '受檢人數', value: 14 }] });
    expect(c?.series).toEqual([{ key: 's0', label: '人數' }]);
    expect(c?.data).toEqual([{ label: '第 1 級', s0: 10 }, { label: '第 3 級', s0: null }]);
  });

  it('compares two counts side by side, even when one happens to be the same on every row', () => {
    const c = chartOf({ columns: ['最大級', '前次人數', '本次人數'], rows: [['第 1 級', 2, 2], ['第 3 級', 3, 2]], summary: [{ label: '兩年皆受檢人數', value: 5 }] });
    expect(c?.series.map(s => s.label)).toEqual(['前次人數', '本次人數']);
  });

  it('drops a total repeated on every row', () => {
    const c = chartOf({ columns: ['部位', '人數（≥3 分）', '總人數', '百分比'], rows: [['頸', 0, 7, '0.0%'], ['下背', 4, 7, '57.1%']], summary: [{ label: '已填寫', value: 7 }] });
    expect(c?.series.map(s => s.label)).toEqual(['人數（≥3 分）']);
  });

  it('draws nothing when the main count is hidden or there are no rows', () => {
    expect(chartOf({ columns: ['部門', '已填寫', '已發送', '填答率'], rows: [['A', null, 5, null], ['B', null, 6, null]], summary: [{ label: '已發送', value: 11 }] })).toBeNull();
    expect(chartOf({ columns: ['部門', '3–4 級人數', '受檢人數', '比率'], rows: [['A', null, null, null]], summary: [{ label: '3–4 級人數', value: null }] })).toBeNull();
    expect(chartOf({ columns: ['部門', '3–4 級人數', '受檢人數', '比率'], rows: [['A', null, null, null], ['B', null, 5, null], ['C', 0, null, null]], summary: [{ label: '3–4 級人數', value: 5 }] })).toBeNull();
    expect(chartOf({ columns: ['事件', '次數', '百分比'], rows: [], summary: [{ label: '事件數', value: 0 }] })).toBeNull();
  });

  it('shows hidden cells as a dash', () => {
    expect(cellText(null)).toBe('—');
    expect(cellText(0)).toBe('0');
    expect(cellText('14.3%')).toBe('14.3%');
  });
});

describe('exports', () => {
  const now = new Date('2026-10-04T10:00:00Z');
  const job = (status: ExportJob['status'], requestedAt: string, expiresAt: string | null = null): ExportJob =>
    ({ id: status + requestedAt, status, format: 'xlsx', fileName: null, requestedAt, expiresAt });

  it('tells ready from expired files', () => {
    expect(exportState(job('done', '2026-10-04T09:00:00Z', '2026-10-05T09:00:00Z'), now)).toBe('ready');
    expect(exportState(job('done', '2026-10-02T09:00:00Z', '2026-10-03T09:00:00Z'), now)).toBe('expired');
    expect(exportState(job('queued', '2026-10-04T09:59:00Z'), now)).toBe('queued');
    expect(exportState(job('failed', '2026-10-04T09:59:00Z'), now)).toBe('failed');
  });

  it('polls only while a recent export is being built', () => {
    expect(pollInterval(undefined, now)).toBe(false);
    expect(pollInterval([job('done', '2026-10-04T09:59:00Z', '2026-10-05T09:59:00Z')], now)).toBe(false);
    expect(pollInterval([job('running', '2026-10-04T09:59:00Z')], now)).toBe(3000);
    expect(pollInterval([job('queued', '2026-10-04T09:00:00Z')], now)).toBe(false);
  });
});
