import { describe, expect, it } from 'vitest';
import {
  checkedItems, checklistBody, composeDetail, countByRisk, emptyRiskDraft, incidentBody, incidentDraft, incidentPatch, incidentProblem, nowTime, occurredText,
  parseDetail, pickSite, pickVictim, placeIncident, receivedText, reviewBody, reviewDraft, reviewNames, reviewProblem, riskBody, riskRows, signLinksText,
  signProgress, staffMatches, VIO_QUESTIONS, VIO_REVIEW, withSaved, type Incident, type Review,
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

describe('site and department in the forms', () => {
  it('drops the department when another site is picked, and keeps it otherwise', () => {
    const d = { siteId: 's1', departmentId: 'd1', note: 'x' };
    expect(pickSite(d, 's2')).toEqual({ siteId: 's2', departmentId: null, note: 'x' });
    expect(pickSite(d, 's1')).toBe(d);
  });
});

describe('事件通報與處理', () => {
  const STORY = '【受害者姓名或特徵】劉雅雯\n【加害者姓名或特徵】男性客戶（約 50 歲）\n【發生原因及過程】\n客戶因退費程序不滿，於櫃台大聲辱罵。\n經主管介入後離開。';
  const saved: Incident = {
    id: 'i1', occurredOn: '2026-09-30', occurredTime: '14:35', siteId: 's1', departmentId: 'd1', departmentName: '客服部', place: '1F 服務櫃台', type: '語言暴力',
    victimEmployeeId: 'e1', victimKind: '內部人員', perpetratorKind: '外部人員', followUps: ['報警處理'], status: '處理中', detail: STORY,
    receivedAt: '2026-09-30T07:10:00.000Z', receiverName: '王護理師',
  };
  const today = '2026-10-04';
  const blank = { victimName: '', perpetratorName: '', relation: '', cause: '', handling: '' };

  it('writes the separate parts into the detail as labelled blocks, and reads them back', () => {
    const story = { ...blank, victimName: ' 劉雅雯 ', perpetratorName: '男性客戶（約 50 歲）', cause: '客戶因退費程序不滿，於櫃台大聲辱罵。\n經主管介入後離開。\n' };
    expect(composeDetail(story)).toBe(STORY);
    expect(parseDetail(STORY)).toEqual({ story: { ...story, victimName: '劉雅雯', cause: '客戶因退費程序不滿，於櫃台大聲辱罵。\n經主管介入後離開。' }, legacy: false });
    expect(composeDetail(blank)).toBeNull();
    expect(composeDetail({ ...blank, relation: '客服人員與客戶', handling: '安排心理諮商' })).toBe('【受害者及加害者關係】客服人員與客戶\n【處理措施】安排心理諮商');
    expect(parseDetail(null)).toEqual({ story: blank, legacy: false });
    expect(parseDetail('  ')).toEqual({ story: blank, legacy: false });
  });

  it('keeps an older free-text detail whole', () => {
    expect(parseDetail(' 課長當眾辱罵\n已轉介諮商 ')).toEqual({ story: { ...blank, cause: '課長當眾辱罵\n已轉介諮商' }, legacy: true });
    expect(parseDetail('備註：【處理措施】稍後補')).toEqual({ story: { ...blank, cause: '備註：【處理措施】稍後補' }, legacy: true });
  });

  it('keeps a repeated label inside the part it appears in', () => {
    expect(parseDetail('【處理措施】\n第一次\n【處理措施】第二次').story.handling).toBe('第一次\n【處理措施】第二次');
  });

  it('starts a new report on today and my first site, or an edit from the record', () => {
    expect(incidentDraft(null, { today, siteId: 's1' })).toEqual({
      occurredOn: today, occurredTime: '', siteId: 's1', departmentId: null, place: '', type: '', victimKind: null, victimEmployeeId: null, perpetratorKind: null,
      followUps: [], ...blank,
    });
    expect(incidentDraft(saved, { today, siteId: 's9' })).toEqual({
      occurredOn: '2026-09-30', occurredTime: '14:35', siteId: 's1', departmentId: 'd1', place: '1F 服務櫃台', type: '語言暴力', victimKind: '內部人員',
      victimEmployeeId: 'e1', perpetratorKind: '外部人員', followUps: ['報警處理'], ...blank, victimName: '劉雅雯', perpetratorName: '男性客戶（約 50 歲）',
      cause: '客戶因退費程序不滿，於櫃台大聲辱罵。\n經主管介入後離開。',
    });
    expect(incidentDraft({ ...saved, occurredTime: null, place: null, detail: null }, { today, siteId: null }))
      .toMatchObject({ occurredTime: '', place: '', ...blank });
  });

  it('checks the date, time, site and type, and trims what it sends', () => {
    const d = { ...incidentDraft(null, { today, siteId: 's1' }), type: '肢體暴力', departmentId: 'd2', place: '  ', relation: '  ' };
    expect(incidentProblem(d, today)).toBeNull();
    expect(incidentProblem({ ...d, occurredOn: '2026-10-05' }, today)).toBe('發生日期不能晚於今天。');
    expect(incidentProblem({ ...d, occurredTime: '24:00' }, today)).toBe('發生時間格式不正確。');
    expect(incidentProblem({ ...d, occurredTime: '15:01' }, today, '15:00')).toBe('發生時間不能晚於現在。');
    expect(incidentProblem({ ...d, occurredTime: '15:00' }, today, '15:00')).toBeNull();
    expect(incidentProblem({ ...d, occurredOn: '2026-10-03', occurredTime: '23:59' }, today, '08:00')).toBeNull();
    expect(incidentProblem({ ...d, siteId: null }, today)).toBe('請選擇廠區。');
    expect(incidentProblem({ ...d, type: ' ' }, today)).toBe('請選擇不法侵害類型。');
    expect(incidentProblem({ ...d, cause: 'x'.repeat(10000) }, today)).toBe('事件內容太長，請精簡後再送出。');
    expect(incidentBody(d)).toEqual({
      occurredOn: today, occurredTime: null, siteId: 's1', departmentId: 'd2', place: null, type: '肢體暴力', victimEmployeeId: null, victimKind: null,
      perpetratorKind: null, detail: null, followUps: [],
    });
    expect(incidentBody({ ...d, occurredTime: '09:30', place: ' 倉庫 ', perpetratorKind: '內部人員', perpetratorName: '課長' }))
      .toMatchObject({ occurredTime: '09:30', place: '倉庫', perpetratorKind: '內部人員', detail: '【加害者姓名或特徵】課長' });
  });

  it('marks a picked victim as internal staff and moves a new report to their site', () => {
    const d = incidentDraft(null, { today, siteId: 's1' });
    expect(pickVictim(d, { id: 'e2', siteId: 's2' }, true)).toMatchObject({ victimEmployeeId: 'e2', victimKind: '內部人員', siteId: 's2', departmentId: null });
    expect(pickVictim({ ...d, departmentId: 'd1' }, { id: 'e2', siteId: 's2' }, false)).toMatchObject({ siteId: 's1', departmentId: 'd1' });
    expect(pickVictim({ ...d, victimEmployeeId: 'e2', victimKind: '內部人員' }, null, true)).toMatchObject({ victimEmployeeId: null, victimKind: '內部人員', siteId: 's1' });
  });

  it('does not send a picked employee for an external victim', () => {
    const d = { ...incidentDraft(null, { today, siteId: 's1' }), type: '其他', victimEmployeeId: 'e2', victimKind: '外部人員' as const };
    expect(incidentBody(d)).toMatchObject({ victimEmployeeId: null, victimKind: '外部人員' });
    expect(incidentPatch(saved, { ...incidentDraft(saved, { today, siteId: null }), victimKind: '外部人員' })).toEqual({ victimEmployeeId: null, victimKind: '外部人員' });
  });

  it('sends only what changed in an edit', () => {
    const d = incidentDraft(saved, { today, siteId: null });
    expect(incidentPatch(saved, d)).toEqual({});
    expect(incidentPatch(saved, { ...d, victimName: '劉雅雯 ', place: '1F 服務櫃台 ' })).toEqual({});
    expect(incidentPatch(saved, { ...d, followUps: ['報警處理', '轉介心理諮商'] })).toEqual({ followUps: ['報警處理', '轉介心理諮商'] });
    expect(incidentPatch(saved, { ...d, departmentId: null })).toEqual({ departmentId: null });
    expect(incidentPatch(saved, { ...d, victimEmployeeId: null, type: '其他' })).toEqual({ victimEmployeeId: null, type: '其他' });
    expect(incidentPatch(saved, { ...d, occurredTime: '', place: '', perpetratorKind: null, victimKind: null }))
      .toEqual({ occurredTime: null, place: null, perpetratorKind: null, victimKind: null });
    expect(incidentPatch(saved, { ...d, handling: '安排心理諮商' })).toEqual({ detail: `${STORY}\n【處理措施】安排心理諮商` });
    expect(incidentPatch(saved, { ...d, ...blank })).toEqual({ detail: null });
  });

  it('leaves an older free-text detail alone unless it is edited', () => {
    const old = { ...saved, detail: '課長當眾辱罵' };
    const d = incidentDraft(old, { today, siteId: null });
    expect(d.cause).toBe('課長當眾辱罵');
    expect(incidentPatch(old, { ...d, perpetratorKind: '內部人員' })).toEqual({ perpetratorKind: '內部人員' });
    expect(incidentPatch(old, { ...d, perpetratorName: '課長' })).toEqual({ detail: '【加害者姓名或特徵】課長\n【發生原因及過程】課長當眾辱罵' });
  });

  it('takes the department along when the site moves', () => {
    const d = incidentDraft(saved, { today, siteId: null });
    expect(incidentPatch(saved, pickSite(d, 's2'))).toEqual({ siteId: 's2', departmentId: null });
    expect(incidentPatch(saved, { ...pickSite(d, 's2'), departmentId: 'd9' })).toEqual({ siteId: 's2', departmentId: 'd9' });
    // Back on the old site with no department picked: the department was cleared.
    expect(incidentPatch(saved, pickSite(pickSite(d, 's2'), 's1'))).toEqual({ departmentId: null });
    // A record without a department moved to another site still says so.
    expect(incidentPatch({ ...saved, departmentId: null, departmentName: null }, pickSite({ ...d, departmentId: null }, 's2'))).toEqual({ siteId: 's2', departmentId: null });
  });

  it('keeps saved choices that are not in the fixed lists', () => {
    expect(withSaved(['語言暴力', '其他'], ['跟蹤'])).toEqual(['語言暴力', '其他', '跟蹤']);
    expect(withSaved(['語言暴力', '其他'], ['其他', ''])).toEqual(['語言暴力', '其他']);
  });

  it('shows the times', () => {
    expect(occurredText(saved)).toBe('2026/09/30 14:35');
    expect(occurredText({ occurredOn: '2026-09-30', occurredTime: null })).toBe('2026/09/30');
    const at = new Date(2026, 8, 30, 15, 10, 42);
    expect(receivedText(at.toISOString())).toBe('2026/09/30 15:10');
    expect(nowTime(new Date(2026, 9, 4, 8, 5))).toBe('08:05');
  });

  it('moves an edited row only when its date or time changed, to where the API lists it', () => {
    const row = (id: string, occurredOn: string, occurredTime: string | null): Incident => ({ ...saved, id, occurredOn, occurredTime });
    const list = [row('a', '2026-10-02', '09:00'), row('b', '2026-10-01', '18:00'), row('c', '2026-10-01', null), row('d', '2026-09-20', '10:00')];
    const ids = (l: Incident[]) => l.map(i => i.id).join('');
    const closed = { ...list[1]!, status: '結案' as const };
    expect(placeIncident(list, closed)[1]).toBe(closed);
    expect(ids(placeIncident(list, row('d', '2026-10-01', '20:00')))).toBe('adbc');
    expect(ids(placeIncident(list, row('a', '2026-10-01', null)))).toBe('bcad');
    expect(ids(placeIncident(list, row('b', '2026-10-03', null)))).toBe('bacd');
    expect(ids(placeIncident(list, row('a', '2026-01-01', '08:00')))).toBe('bcda');
    expect(ids(placeIncident(list, row('x', '2026-10-09', null)))).toBe('abcd');
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

