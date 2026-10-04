import { describe, expect, it } from 'vitest';
import {
  checkedItems, checklistBody, countByRisk, emptyRiskDraft, reviewBody, reviewDraft, reviewNames, reviewProblem, riskBody, riskRows, signLinksText, signProgress,
  staffMatches, VIO_QUESTIONS, VIO_REVIEW, type Review,
} from './violence';

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
  it('sends answered factors only', () => {
    expect(checklistBody({ 照明: { ok: false, note: ' 加裝 ' }, 噪音: { ok: null, note: '' }, 溫度: { ok: true, note: '' } }))
      .toEqual([{ item: '照明', ok: false, note: '加裝' }, { item: '溫度', ok: true, note: '' }]);
  });
});

describe('措施查核及評估', () => {
  const ROLES = ['職業安全衛生人員', '人力資源管理人員'];
  const sig = (p: Partial<Review['signatures'][number]>): Review['signatures'][number] =>
    ({ id: 'g', role: '職業安全衛生人員', name: '測試', email: 't@example.test', firstSentAt: null, sentAt: null, signedAt: null, comment: null, ...p });
  const saved: Review = {
    id: 'r1', siteId: 's1', siteName: '桃園廠', departmentId: 'd1', departmentName: '品保部', reviewedOn: '2026-10-01', status: '草稿',
    items: [{ item: '建構行為規範', points: ['組織政策規範'], result: '已公告', fix: '' }, { item: '自訂項目', points: [], result: 'x', fix: '' }],
    signatures: [sig({ name: '陳立民', email: 'chen@example.test' })],
  };

  it('starts a new review with the seven items, today and my first site', () => {
    const d = reviewDraft(null, { today: '2026-10-04', siteId: 's1' });
    expect(d.items.map(i => i.item)).toEqual(VIO_REVIEW.map(v => v.item));
    expect(d).toEqual(expect.objectContaining({ reviewedOn: '2026-10-04', siteId: 's1', departmentId: null, signers: [] }));
  });

  it('opens a draft with its saved answers in place and keeps items outside the list', () => {
    const d = reviewDraft(saved, { today: '2026-10-04', siteId: 's2' });
    expect(d.items).toHaveLength(VIO_REVIEW.length + 1);
    expect(d.items[3]).toEqual({ item: '建構行為規範', points: ['組織政策規範'], result: '已公告', fix: '' });
    expect(d.items.at(-1)!.item).toBe('自訂項目');
    expect(d.signers).toEqual([{ role: '職業安全衛生人員', name: '陳立民', email: 'chen@example.test' }]);
    expect(checkedItems(d.items)).toBe(2);
  });

  it('checks the date, site and every signer', () => {
    const d = reviewDraft(null, { today: '2026-10-04', siteId: 's1' });
    expect(reviewProblem(d, ROLES)).toBeNull();
    expect(reviewProblem({ ...d, siteId: null }, ROLES)).toBe('請選擇廠區。');
    expect(reviewProblem({ ...d, reviewedOn: '' }, ROLES)).toBe('請填寫檢核日期。');
    expect(reviewProblem({ ...d, signers: [{ role: null, name: '', email: '' }] }, ROLES)).toBeNull();
    expect(reviewProblem({ ...d, signers: [{ role: '職業安全衛生人員', name: '王', email: '' }] }, ROLES)).toBe('每位簽核人員都要填類別、姓名與 Email。');
    expect(reviewProblem({ ...d, signers: [{ role: '勞工代表', name: '王', email: 'w@x.test' }] }, ROLES)).toBe('簽核人員的類別請從清單選擇。');
    expect(reviewProblem({ ...d, signers: [{ role: '人力資源管理人員', name: '王', email: 'w@x' }] }, ROLES)).toBe('王 的 Email 格式不正確。');
    const many = Array.from({ length: 11 }, (_, i) => ({ role: '人力資源管理人員', name: `測試${i}`, email: `t${i}@x.test` }));
    expect(reviewProblem({ ...d, signers: many }, ROLES)).toBe('簽核人員最多 10 位。');
  });

  it('sends every item trimmed and drops blank signer rows', () => {
    const d = reviewDraft(null, { today: '2026-10-04', siteId: 's1' });
    d.items[0] = { ...d.items[0]!, points: ['組織'], result: ' 完成 ', fix: ' 增設標語 ' };
    d.signers = [{ role: '人力資源管理人員', name: ' 林人資 ', email: ' HR@Example.test ' }, { role: null, name: '', email: '' }];
    const body = reviewBody(d);
    expect(body.items).toHaveLength(VIO_REVIEW.length);
    expect(body.items[0]).toEqual({ item: '辨識及評估危害', points: ['組織'], result: '完成', fix: '增設標語' });
    expect(body.signers).toEqual([{ role: '人力資源管理人員', name: '林人資', email: 'hr@example.test' }]);
    expect(body).toEqual(expect.objectContaining({ siteId: 's1', departmentId: null, reviewedOn: '2026-10-04' }));
  });

  it('sums up the sign-off', () => {
    expect(signProgress([])).toEqual({ signed: 0, total: 0, tone: 'warn' });
    expect(signProgress([sig({ sentAt: 'x' }), sig({ sentAt: 'x', signedAt: 'y' })])).toEqual({ signed: 1, total: 2, tone: 'info' });
    expect(signProgress([sig({ sentAt: 'x', signedAt: 'y' })])).toEqual({ signed: 1, total: 1, tone: 'ok' });
  });
});

describe('sign-off links', () => {
  it('says a signing email was sent only when the API says so, and asks to copy the link otherwise', () => {
    expect(signLinksText([])).toEqual({ text: '沒有需要簽核的人員。', copy: false });
    expect(signLinksText([{ emailed: true }, { emailed: true }])).toEqual({ text: '已寄簽核信給 2 位簽核人員。', copy: false });
    expect(signLinksText([{ emailed: false }, { emailed: false }])).toEqual({ text: '沒有寄出簽核信，請複製下方連結交給 2 位簽核人員。', copy: true });
    expect(signLinksText([{ emailed: true }, { emailed: false }])).toEqual({ text: '已寄簽核信給 1 位簽核人員；1 位沒有寄出，請複製連結交給他們。', copy: true });
  });

  it('suggests staff by name or email, keyed by account id', () => {
    const staff = [
      { id: 'u1', name: '陳安全', email: 'safety@demo.test' },
      { id: 'u2', name: '陳安全', email: 'safety2@demo.test' },
      { id: 'u3', name: '林人資', email: 'hr@demo.test' },
    ];
    expect(staffMatches(staff, '陳').map(o => o.value)).toEqual(['u1', 'u2']);
    expect(staffMatches(staff, ' HR@ ')).toEqual([{ value: 'u3', label: '林人資' }]);
    expect(staffMatches(staff, '')).toHaveLength(3);
    expect(staffMatches(staff, '', 2)).toHaveLength(2);
    expect(staffMatches(staff, 'nobody')).toEqual([]);
  });
});

describe('review list filters', () => {
  it('labels sites and departments from the names each review carries', () => {
    const n = reviewNames([
      { siteId: 's1', siteName: '桃園廠', departmentId: 'd1', departmentName: '製造一課' },
      { siteId: 's2', siteName: '新竹廠', departmentId: null, departmentName: null },
    ]);
    expect(n.site('s2')).toBe('新竹廠');
    expect(n.department('d1')).toBe('製造一課');
    expect(n.department('d2')).toBe('—');
  });
});

