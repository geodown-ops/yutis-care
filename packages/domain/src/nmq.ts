/* Nordic Musculoskeletal Questionnaire (肌肉骨骼症狀調查). Each body part is scored 0–5. */

export const NMQ_PARTS = [
  { k: 'neck', side: false }, { k: 'shoulder', side: true }, { k: 'upperBack', side: false }, { k: 'lowerBack', side: false },
  { k: 'elbow', side: true }, { k: 'wrist', side: true }, { k: 'hip', side: true }, { k: 'knee', side: true }, { k: 'ankle', side: true },
] as const;

export interface NmqKey { key: string; part: string; side?: 'L' | 'R' }
export const NMQ_KEYS: readonly NmqKey[] = NMQ_PARTS.flatMap((p): NmqKey[] =>
  p.side ? [{ key: p.k + 'L', part: p.k, side: 'L' }, { key: p.k + 'R', part: p.k, side: 'R' }] : [{ key: p.k, part: p.k }]);

/** Any body part scoring at or above this marks the worker as a suspected ergonomic hazard. */
export const NMQ_HAZARD_THRESHOLD = 3;

export type NmqScores = Record<string, number | string>;

export function nmqMax(scores: NmqScores | null | undefined): number | null {
  if (!scores) return null;
  const v = Object.values(scores).map(Number);
  return v.length ? Math.max(...v) : null;
}

export function nmqSuspectedHazard(scores: NmqScores | null | undefined): boolean {
  const m = nmqMax(scores);
  return m != null && m >= NMQ_HAZARD_THRESHOLD;
}

export function nmqHazardLabel(scores: NmqScores | null | undefined): string {
  const m = nmqMax(scores);
  if (m == null) return '';
  return m >= NMQ_HAZARD_THRESHOLD ? `疑似有危害（${m}）` : '無明顯危害';
}
