import { describe, expect, it } from 'vitest';
import { checklistBody, countByRisk, emptyRiskDraft, parseChecklists, parseIncidents, riskBody, riskRows, VIO_QUESTIONS } from './violence';

describe('violence risk assessment', () => {
  it('reads stored items and recomputes a missing risk', () => {
    const rows = riskRows([
      { question: 'Q1', likelihood: '可能', severity: '嚴重', controls: '門禁', risk: '高度風險' },
      { question: 'Q2', likelihood: '不太可能', severity: '中' },
      { question: 'Q3', likelihood: '亂填', severity: '輕' },
      null,
    ]);
    expect(rows.map(r => r.risk)).toEqual(['高度風險', '中度風險', null, null]);
    expect(rows[1]!.controls).toBe('');
    expect(countByRisk(rows)).toEqual({ 高度風險: 1, 中度風險: 1, 低度風險: 0 });
  });

  it('sends only the risks marked as present, each fully rated', () => {
    const draft = emptyRiskDraft();
    expect(draft).toHaveLength(VIO_QUESTIONS.length);
    expect(riskBody(draft)).toEqual({ problem: '請至少勾選一項存在的潛在風險。' });
    draft[3] = { ...draft[3]!, applies: true, likelihood: '可能' };
    expect(riskBody(draft)).toEqual({ problem: '勾選的風險都要選擇可能性與嚴重性。' });
    draft[3] = { ...draft[3]!, severity: '輕', controls: ' 兩人一組 ' };
    expect(riskBody(draft)).toEqual({ items: [{ question: VIO_QUESTIONS[3].q, likelihood: '可能', severity: '輕', controls: '兩人一組' }] });
    draft.push({ question: ' ', applies: true, likelihood: '可能', severity: '輕', controls: '', custom: true });
    expect(riskBody(draft)).toEqual({ problem: '請填寫新增的潛在風險內容。' });
  });
});

describe('violence checklists', () => {
  it('reads stored checklists and skips unknown kinds', () => {
    const list = parseChecklists([
      { id: 'c1', kind: '作業場所', siteId: 's1', checkedOn: '2026-09-01', items: [{ item: '照明', ok: false, note: '走道燈不足' }, { item: '噪音', ok: true }] },
      { id: 'c2', kind: '其他', siteId: 's1', checkedOn: '2026-09-01', items: [] },
      { id: 'c3', kind: '人力', siteId: 's1', checkedOn: '2026-09-02' },
    ]);
    expect(list.map(c => c.id)).toEqual(['c1', 'c3']);
    expect(list[0]!.items).toEqual([{ item: '照明', ok: false, note: '走道燈不足' }, { item: '噪音', ok: true, note: '' }]);
    expect(list[1]!.items).toEqual([]);
  });

  it('sends answered factors only', () => {
    expect(checklistBody({ 照明: { ok: false, note: ' 加裝 ' }, 噪音: { ok: null, note: '' }, 溫度: { ok: true, note: '' } }))
      .toEqual([{ item: '照明', ok: false, note: '加裝' }, { item: '溫度', ok: true, note: '' }]);
  });
});

describe('violence incidents', () => {
  it('reads stored incidents defensively', () => {
    expect(parseIncidents([{ id: 'i1', occurredOn: '2026-09-01', siteId: 's1', type: '語言暴力', victimEmployeeId: null, followUps: ['報警處理', 3], detail: '客人辱罵' }]))
      .toEqual([{ id: 'i1', occurredOn: '2026-09-01', siteId: 's1', type: '語言暴力', victimEmployeeId: null, followUps: ['報警處理'], status: '處理中', detail: '客人辱罵' }]);
  });
});
