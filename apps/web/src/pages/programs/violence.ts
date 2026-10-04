/*
 * Pure helpers for 執行職務遭受不法侵害預防 over /api/programs/violence/*. Checklists and incidents come back as
 * untyped objects, so they are read defensively here. Question and factor lists follow the prototype.
 */
import type { Schemas } from '@yutis/api-client';
import { violenceRisk, VIO_LIKELIHOOD, VIO_SEVERITY, type VioLikelihood, type VioRisk, type VioSeverity } from '@yutis/domain';

export type RiskAssessment = Schemas['RiskAssessmentDto'];
export type ChecklistKind = '作業場所' | '人力';

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

export interface ChecklistItem { item: string; ok: boolean; note: string }
export interface Checklist { id: string; kind: ChecklistKind; siteId: string; checkedOn: string; items: ChecklistItem[] }

export function parseChecklists(rows: readonly unknown[]): Checklist[] {
  return rows.map(rec).filter(r => r.kind === '作業場所' || r.kind === '人力').map(r => ({
    id: str(r.id), kind: r.kind as ChecklistKind, siteId: str(r.siteId), checkedOn: str(r.checkedOn),
    items: (Array.isArray(r.items) ? r.items : []).map(rec).map(i => ({ item: str(i.item), ok: i.ok === true, note: str(i.note) })),
  }));
}

/** Checked items as the API wants them; unanswered factors are left out. */
export function checklistBody(answers: Record<string, { ok: boolean | null; note: string }>): ChecklistItem[] {
  return Object.entries(answers).filter(([, a]) => a.ok !== null).map(([item, a]) => ({ item, ok: a.ok!, note: a.note.trim() }));
}

export interface Incident {
  id: string; occurredOn: string; siteId: string; type: string; victimEmployeeId: string | null;
  followUps: string[]; status: string; detail: string | null;
}

export function parseIncidents(rows: readonly unknown[]): Incident[] {
  return rows.map(rec).map(r => ({
    id: str(r.id), occurredOn: str(r.occurredOn), siteId: str(r.siteId), type: str(r.type),
    victimEmployeeId: typeof r.victimEmployeeId === 'string' ? r.victimEmployeeId : null,
    followUps: Array.isArray(r.followUps) ? r.followUps.filter((f): f is string => typeof f === 'string') : [],
    status: str(r.status) || '處理中', detail: typeof r.detail === 'string' ? r.detail : null,
  }));
}
