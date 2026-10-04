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

