/*
 * Pure helpers for 執行職務遭受不法侵害預防 over /api/programs/violence/*. Risk items are stored loosely and read
 * defensively; checklists, incidents and reviews are typed. Question, factor and review lists follow the prototype.
 */
import type { Schemas, TenantPaths } from '@yutis/api-client';
import { violenceRisk, VIO_LIKELIHOOD, VIO_SEVERITY, type VioLikelihood, type VioRisk, type VioSeverity } from '@yutis/domain';

export type RiskAssessment = Schemas['RiskAssessmentDto'];
export type Checklist = Schemas['ChecklistDto'];
export type ChecklistItem = Schemas['ChecklistItemDto'];
export type ChecklistKind = Checklist['kind'];
export type Incident = Schemas['IncidentDto'];
export type Review = Schemas['ViolenceReviewDto'];
export type Signature = Schemas['SignatureDto'];
export type SignLink = Schemas['SignLinkDto'];
export type ReviewBody = TenantPaths['/api/programs/violence/reviews']['post']['requestBody']['content']['application/json'];

export const VIO_RISKS: readonly VioRisk[] = ['高度風險', '中度風險', '低度風險'];
export const RISK_TONE: Record<VioRisk, 'bad' | 'warn' | 'ok'> = { 高度風險: 'bad', 中度風險: 'warn', 低度風險: 'ok' };

export const VIO_QUESTIONS = [
  { group: '外部不法侵害', q: '是否有組織外之人員（承包商、客戶、服務對象或親友等）因其行為無法預知，可能成為該區工作者之不法侵害來源？' },
  { group: '外部不法侵害', q: '是否有已知工作會接觸有暴力史之客戶？' },
  { group: '外部不法侵害', q: '勞工之工作性質是否為執行公共安全業務？' },
  { group: '外部不法侵害', q: '勞工之工作是否為單獨作業？' },
  { group: '外部不法侵害', q: '勞工是否需於夜間或深夜工作？' },
  { group: '外部不法侵害', q: '勞工是否需攜帶或處理現金、貴重物品？' },
  { group: '內部不法侵害', q: '組織內是否曾發生主管或同事利用職權或群體力量霸凌、騷擾之情事？' },
  { group: '內部不法侵害', q: '是否有勞工因工作或個人因素承受較大壓力，可能引發衝突？' },
  { group: '內部不法侵害', q: '是否曾發生性騷擾或性別歧視之申訴？' },
] as const;

/** Checklist factors per kind: 作業場所 (適當配置作業場所) and 人力 (依工作適性適當調整人力). */
export const CHECKLIST_GROUPS: Record<ChecklistKind, { name: string; items: readonly string[] }[]> = {
  作業場所: [
    { name: '物理環境', items: ['噪音', '照明', '溫度', '濕度', '通風狀況', '建築結構', '出入口管制', '監視系統'] },
    { name: '工作場所設計', items: ['櫃台高度與深度', '緊急求助按鈕', '逃生通道', '等候區動線', '停車場與周邊照明'] },
  ],
  人力: [
    { name: '適性配工', items: ['面對大量顧客（如重大節日之前後、尖峰時段）', '單獨作業或夜間工作', '需在不同作業場所移動', '勞工舉報有遭受不法侵害威脅恐嚇者'] },
    { name: '工作設計', items: ['工作量與人力配置', '輪班排程', '客訴處理流程', '現金或貴重物品處理流程'] },
  ],
};

export const VIO_INC_TYPES = ['肢體暴力', '語言暴力', '心理暴力', '性騷擾', '其他'] as const;
export const VIO_FOLLOW = ['轉介心理諮商', '調整職務／工作地點', '報警處理', '提供法律協助', '加害者懲處或拒絕服務'] as const;

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? v as Record<string, unknown> : {});
const isRisk = (v: unknown): v is VioRisk => (VIO_RISKS as readonly unknown[]).includes(v);

export interface RiskRow { question: string; likelihood: string; severity: string; controls: string; risk: VioRisk | null }

/** Items of a stored risk assessment; the risk is recomputed when missing. */
export function riskRows(items: readonly unknown[]): RiskRow[] {
  return items.map(i => {
    const r = rec(i);
    const likelihood = str(r.likelihood);
    const severity = str(r.severity);
    const stored = isRisk(r.risk) ? r.risk : null;
    const computed = (VIO_LIKELIHOOD as readonly string[]).includes(likelihood) && (VIO_SEVERITY as readonly string[]).includes(severity)
      ? violenceRisk(likelihood as VioLikelihood, severity as VioSeverity) : null;
    return { question: str(r.question), likelihood, severity, controls: str(r.controls), risk: stored ?? computed };
  });
}

export function countByRisk(rows: readonly { risk: VioRisk | null }[]): Record<VioRisk, number> {
  const out: Record<VioRisk, number> = { 高度風險: 0, 中度風險: 0, 低度風險: 0 };
  for (const r of rows) if (r.risk) out[r.risk] += 1;
  return out;
}

export interface RiskDraftRow { question: string; applies: boolean; likelihood: VioLikelihood | null; severity: VioSeverity | null; controls: string; custom?: boolean }

export const emptyRiskDraft = (): RiskDraftRow[] => VIO_QUESTIONS.map(q => ({ question: q.q, applies: false, likelihood: null, severity: null, controls: '' }));

/** The items body for POST risk-assessments (only the risks marked 是), or a problem to show instead. */
export function riskBody(rows: readonly RiskDraftRow[]):
  { items: { question: string; likelihood: VioLikelihood; severity: VioSeverity; controls: string }[] } | { problem: string } {
  const picked = rows.filter(r => r.applies);
  if (!picked.length) return { problem: '請至少勾選一項存在的潛在風險。' };
  if (picked.some(r => !r.question.trim())) return { problem: '請填寫新增的潛在風險內容。' };
  if (picked.some(r => !r.likelihood || !r.severity)) return { problem: '勾選的風險都要選擇可能性與嚴重性。' };
  return { items: picked.map(r => ({ question: r.question.trim(), likelihood: r.likelihood!, severity: r.severity!, controls: r.controls.trim() })) };
}

/** Checked items as the API wants them; unanswered factors are left out. */
export function checklistBody(answers: Record<string, { ok: boolean | null; note: string }>): ChecklistItem[] {
  return Object.entries(answers).filter(([, a]) => a.ok !== null).map(([item, a]) => ({ item, ok: a.ok!, note: a.note.trim() }));
}

/** The site a record is about, and optionally one of its departments (none: the whole site, or not given). */
export interface Place { siteId: string | null; departmentId: string | null }

/** A form's site and department: another site drops the department, which belongs to the old one. */
export function pickSite<T extends Place>(d: T, siteId: string | null): T {
  return siteId === d.siteId ? d : { ...d, siteId, departmentId: null };
}

/* ---------- 事件通報與處理 (incidents) ---------- */

export type PersonKind = NonNullable<Incident['perpetratorKind']>;
export const PERSON_KINDS: readonly PersonKind[] = ['內部人員', '外部人員'];

/**
 * The prototype's report fields that the API keeps together in the encrypted `detail`: both parties' names or
 * features, their relationship, what happened and how it was handled.
 */
export interface IncidentStory { victimName: string; perpetratorName: string; relation: string; cause: string; handling: string }
export const STORY_LABEL: Record<keyof IncidentStory, string> = {
  victimName: '受害者姓名或特徵', perpetratorName: '加害者姓名或特徵', relation: '受害者及加害者關係', cause: '發生原因及過程', handling: '處理措施',
};
const STORY_KEYS = Object.keys(STORY_LABEL) as (keyof IncidentStory)[];
const LABEL_LINE = new RegExp(`^【(${STORY_KEYS.map(k => STORY_LABEL[k]).join('|')})】(.*)$`);
const keyOf = new Map(STORY_KEYS.map(k => [STORY_LABEL[k], k]));
export const emptyStory = (): IncidentStory => ({ victimName: '', perpetratorName: '', relation: '', cause: '', handling: '' });

/**
 * The detail text: one labelled block per part filled in, in the report's order, readable as it is stored
 * (「【受害者姓名或特徵】劉雅雯」; a part of several lines starts on the line after its label). Null when all are blank.
 */
export function composeDetail(s: IncidentStory): string | null {
  const blocks = STORY_KEYS.flatMap(k => {
    const v = s[k].trim();
    if (!v) return [];
    return [v.includes('\n') ? `【${STORY_LABEL[k]}】\n${v}` : `【${STORY_LABEL[k]}】${v}`];
  });
  return blocks.length ? blocks.join('\n') : null;
}

/**
 * The parts of a detail written by composeDetail. Text from before (not opening with one of the labels) is kept
 * whole as 發生原因及過程, and `legacy` says so.
 */
export function parseDetail(detail: string | null): { story: IncidentStory; legacy: boolean } {
  const story = emptyStory();
  const text = (detail ?? '').trim();
  if (!text) return { story, legacy: false };
  const lines = text.split(/\r?\n/);
  if (!LABEL_LINE.test(lines[0]!)) return { story: { ...story, cause: text }, legacy: true };
  const parts = new Map<keyof IncidentStory, string[]>();
  let current: string[] = [];
  for (const line of lines) {
    const m = LABEL_LINE.exec(line);
    const key = m ? keyOf.get(m[1]!)! : null;
    // A label seen before is just text of the part it appears in.
    if (key && !parts.has(key)) { current = [m![2]!]; parts.set(key, current); } else current.push(line);
  }
  for (const [k, v] of parts) story[k] = v.join('\n').trim();
  return { story, legacy: false };
}

export interface IncidentDraft extends IncidentStory {
  occurredOn: string; occurredTime: string; siteId: string | null; departmentId: string | null; place: string; type: string;
  victimKind: PersonKind | null; victimEmployeeId: string | null; perpetratorKind: PersonKind | null; followUps: string[];
}
export type IncidentBody = TenantPaths['/api/programs/violence/incidents']['post']['requestBody']['content']['application/json'];
export type IncidentPatch = NonNullable<TenantPaths['/api/programs/violence/incidents/{id}']['patch']['requestBody']>['content']['application/json'];

export function incidentDraft(i: Incident | null, defaults: { today: string; siteId: string | null }): IncidentDraft {
  return i
    ? {
      occurredOn: i.occurredOn, occurredTime: i.occurredTime ?? '', siteId: i.siteId, departmentId: i.departmentId, place: i.place ?? '', type: i.type,
      victimKind: i.victimKind, victimEmployeeId: i.victimEmployeeId, perpetratorKind: i.perpetratorKind, followUps: [...i.followUps], ...parseDetail(i.detail).story,
    }
    : {
      occurredOn: defaults.today, occurredTime: '', siteId: defaults.siteId, departmentId: null, place: '', type: '',
      victimKind: null, victimEmployeeId: null, perpetratorKind: null, followUps: [], ...emptyStory(),
    };
}

/** An employee picked as the victim is internal staff; `followSite` also moves a new report to their site. */
export function pickVictim(d: IncidentDraft, e: { id: string; siteId: string } | null, followSite: boolean): IncidentDraft {
  const next: IncidentDraft = { ...d, victimEmployeeId: e?.id ?? null, victimKind: e ? '內部人員' : d.victimKind };
  return e && followSite ? pickSite(next, e.siteId) : next;
}

/** An external victim is not one of our employees: an employee picked before stays on the form but is not sent. */
const victimId = (d: IncidentDraft) => (d.victimKind === '外部人員' ? null : d.victimEmployeeId);

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_DETAIL = 10000;

/** What stops the report from being saved; with `now` (HH:MM) a time later today is refused too. */
export function incidentProblem(d: IncidentDraft, today: string, now?: string): string | null {
  if (!d.occurredOn) return '請填寫發生日期。';
  if (d.occurredOn > today) return '發生日期不能晚於今天。';
  if (d.occurredTime && !TIME.test(d.occurredTime)) return '發生時間格式不正確。';
  if (d.occurredTime && now && d.occurredOn === today && d.occurredTime > now) return '發生時間不能晚於現在。';
  if (!d.siteId) return '請選擇廠區。';
  if (!d.type.trim()) return '請選擇不法侵害類型。';
  if ((composeDetail(d)?.length ?? 0) > MAX_DETAIL) return '事件內容太長，請精簡後再送出。';
  return null;
}

/** POST body for a new incident; check incidentProblem first (the site is required). */
export function incidentBody(d: IncidentDraft): IncidentBody {
  return {
    occurredOn: d.occurredOn, occurredTime: d.occurredTime || null, siteId: d.siteId!, departmentId: d.departmentId, place: d.place.trim() || null,
    type: d.type.trim(), victimEmployeeId: victimId(d), victimKind: d.victimKind, perpetratorKind: d.perpetratorKind, detail: composeDetail(d),
    followUps: d.followUps,
  };
}

/**
 * PATCH body for an edit: only the fields that changed, since the API records each one sent as changed. A move to
 * another site always takes departmentId along (null when none is picked): the old department is not in the new site.
 * The detail counts as changed only when one of its parts did, so an older free-text record keeps its text when
 * something else is edited.
 */
export function incidentPatch(i: Incident, d: IncidentDraft): IncidentPatch {
  const out: IncidentPatch = {};
  const type = d.type.trim();
  const place = d.place.trim() || null;
  const detail = composeDetail(d);
  if (d.occurredOn !== i.occurredOn) out.occurredOn = d.occurredOn;
  if ((d.occurredTime || null) !== i.occurredTime) out.occurredTime = d.occurredTime || null;
  if (d.siteId && d.siteId !== i.siteId) out.siteId = d.siteId;
  if (out.siteId || d.departmentId !== i.departmentId) out.departmentId = d.departmentId;
  if (place !== i.place) out.place = place;
  if (type !== i.type) out.type = type;
  if (victimId(d) !== i.victimEmployeeId) out.victimEmployeeId = victimId(d);
  if (d.victimKind !== i.victimKind) out.victimKind = d.victimKind;
  if (d.perpetratorKind !== i.perpetratorKind) out.perpetratorKind = d.perpetratorKind;
  if (detail !== composeDetail(parseDetail(i.detail).story)) out.detail = detail;
  if (d.followUps.length !== i.followUps.length || d.followUps.some((f, n) => f !== i.followUps[n])) out.followUps = d.followUps;
  return out;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** 發生時間: "2026/09/30 14:35", or the date alone when no time was given. */
export const occurredText = (i: Pick<Incident, 'occurredOn' | 'occurredTime'>) =>
  `${i.occurredOn.replaceAll('-', '/')}${i.occurredTime ? ` ${i.occurredTime}` : ''}`;

/** 受理時間 in local time: "2026/10/04 15:10". */
export function receivedText(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** The time now as HH:MM (local), for the form's check. */
export const nowTime = (at = new Date()) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

/** Whether a is listed before b by the API: newest date first, then time, records without a time last. */
const listedBefore = (a: Incident, b: Incident) =>
  a.occurredOn !== b.occurredOn ? a.occurredOn > b.occurredOn : (a.occurredTime ?? '') > (b.occurredTime ?? '');

/**
 * The list after an edit: the saved row replaces the old one, and moves only when its date or time changed, to where
 * the API would list it. The others keep the API's order.
 */
export function placeIncident(list: readonly Incident[], row: Incident): Incident[] {
  const old = list.find(i => i.id === row.id);
  if (!old) return [...list];
  if (old.occurredOn === row.occurredOn && old.occurredTime === row.occurredTime) return list.map(i => (i.id === row.id ? row : i));
  const rest = list.filter(i => i.id !== row.id);
  const at = rest.findIndex(i => listedBefore(row, i));
  return at < 0 ? [...rest, row] : [...rest.slice(0, at), row, ...rest.slice(at)];
}

/** Fixed choices plus whatever the record already holds outside them (the API takes any text). */
export const withSaved = (choices: readonly string[], saved: readonly string[]) => [...choices, ...saved.filter(s => s && !choices.includes(s))];

/* ---------- 措施查核及評估 (reviews): a draft, then sign-off by email ---------- */

/** The seven review items and the points to check under each, as in the prototype. */
export const VIO_REVIEW = [
  { item: '辨識及評估危害', points: ['組織', '個人因素', '工作環境', '工作流程'] },
  { item: '適當配置作業場所', points: ['物理環境', '工作場所設計'] },
  { item: '依工作適性適當調整人力', points: ['適性配工', '工作設計'] },
  { item: '建構行為規範', points: ['組織政策規範', '個人行為規範'] },
  { item: '辦理危害預防及溝通技巧訓練', points: ['教育訓練', '溝通技巧'] },
  { item: '建立事件處理程序', points: ['通報流程', '申訴管道'] },
  { item: '執行成效之評估及改善', points: ['成效評估', '持續改善'] },
] as const;

export const MAX_SIGNERS = 10;
export interface ReviewItemDraft { item: string; points: string[]; result: string; fix: string }
export interface SignerDraft { role: string | null; name: string; email: string }
export interface ReviewDraft { reviewedOn: string; siteId: string | null; departmentId: string | null; items: ReviewItemDraft[]; signers: SignerDraft[] }

export const emptySigner = (): SignerDraft => ({ role: null, name: '', email: '' });

/** The form: the seven items in order (with whatever was saved for each), then any other saved item, and the signers. */
export function reviewDraft(r: Review | null, defaults: { today: string; siteId: string | null }): ReviewDraft {
  const saved = new Map((r?.items ?? []).map(i => [i.item, i]));
  const items = [
    ...VIO_REVIEW.map(v => saved.get(v.item) ?? { item: v.item, points: [], result: '', fix: '' }),
    ...(r?.items ?? []).filter(i => !VIO_REVIEW.some(v => v.item === i.item)),
  ].map(i => ({ item: i.item, points: [...i.points], result: i.result, fix: i.fix }));
  return {
    reviewedOn: r?.reviewedOn ?? defaults.today, siteId: r?.siteId ?? defaults.siteId, departmentId: r?.departmentId ?? null, items,
    signers: r ? r.signatures.map(s => ({ role: s.role, name: s.name, email: s.email })) : [],
  };
}

/** Items with a point checked or a result written (已檢核項目). */
export const checkedItems = (items: readonly Pick<ReviewItemDraft, 'points' | 'result'>[]) => items.filter(i => i.points.length > 0 || i.result.trim() !== '').length;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const blankSigner = (s: SignerDraft) => !s.role && !s.name.trim() && !s.email.trim();

/** What stops the review from being saved, in plain words; `roles` are the tenant's sign-off roles. */
export function reviewProblem(d: ReviewDraft, roles: readonly string[]): string | null {
  if (!d.reviewedOn) return '請填寫檢核日期。';
  if (!d.siteId) return '請選擇廠區。';
  const signers = d.signers.filter(s => !blankSigner(s));
  if (signers.length > MAX_SIGNERS) return `簽核人員最多 ${MAX_SIGNERS} 位。`;
  if (signers.some(s => !s.role || !s.name.trim() || !s.email.trim())) return '每位簽核人員都要填類別、姓名與 Email。';
  if (signers.some(s => !roles.includes(s.role!))) return '簽核人員的類別請從清單選擇。';
  const bad = signers.find(s => !EMAIL.test(s.email.trim()));
  if (bad) return `${bad.name.trim()} 的 Email 格式不正確。`;
  return null;
}

/** POST/PUT body: every item, trimmed; signer rows left blank are dropped. */
export function reviewBody(d: ReviewDraft): ReviewBody {
  return {
    siteId: d.siteId!, departmentId: d.departmentId, reviewedOn: d.reviewedOn,
    items: d.items.map(i => ({ item: i.item, points: i.points, result: i.result.trim(), fix: i.fix.trim() })),
    signers: d.signers.filter(s => !blankSigner(s)).map(s => ({ role: s.role!, name: s.name.trim(), email: s.email.trim().toLowerCase() })),
  };
}

/** 簽核 column: how many signed, and the tone to show it in. */
export function signProgress(sigs: readonly Pick<Signature, 'signedAt' | 'sentAt'>[]): { signed: number; total: number; tone: 'ok' | 'info' | 'warn' } {
  const signed = sigs.filter(s => s.signedAt).length;
  return { signed, total: sigs.length, tone: sigs.length && signed === sigs.length ? 'ok' : sigs.some(s => s.sentAt) ? 'info' : 'warn' };
}

export const REVIEW_TONE: Record<Review['status'], 'warn' | 'info' | 'ok'> = { 草稿: 'warn', 簽核中: 'info', 已完成: 'ok' };

/**
 * What to say after sign-off links are issued (送出簽核 or 重寄). SignLinkDto.emailed is true only when the mail
 * service really sends (never on the demo site); otherwise the links have to be handed over by hand.
 */
export function signLinksText(links: readonly Pick<SignLink, 'emailed'>[]): { text: string; copy: boolean } {
  const sent = links.filter(l => l.emailed).length;
  if (!links.length) return { text: '沒有需要簽核的人員。', copy: false };
  if (sent === links.length) return { text: `已寄簽核信給 ${sent} 位簽核人員。`, copy: false };
  if (!sent) return { text: `沒有寄出簽核信，請複製下方連結交給 ${links.length} 位簽核人員。`, copy: true };
  return { text: `已寄簽核信給 ${sent} 位簽核人員；${links.length - sent} 位沒有寄出，請複製連結交給他們。`, copy: true };
}

/** Labels for the review list's filters, from the names each review carries. */
export function reviewNames(list: readonly Pick<Review, 'siteId' | 'siteName' | 'departmentId' | 'departmentName'>[]) {
  const sites = new Map(list.map(r => [r.siteId, r.siteName]));
  const deps = new Map(list.flatMap(r => (r.departmentId ? [[r.departmentId, r.departmentName ?? '—'] as const] : [])));
  return { site: (id: string) => sites.get(id) ?? '—', department: (id: string) => deps.get(id) ?? '—' };
}

/**
 * Signer name suggestions from GET /api/staff: matched on name or email, so typing part of an address works too.
 * The option value is the account id (names can repeat); the label is the name.
 */
export function staffMatches(staff: readonly { id: string; name: string; email: string }[], search: string, limit = 20): { value: string; label: string }[] {
  const q = search.trim().toLowerCase();
  return staff.filter(s => !q || s.name.toLowerCase().includes(q) || s.email.toLowerCase().includes(q)).slice(0, limit).map(s => ({ value: s.id, label: s.name }));
}

