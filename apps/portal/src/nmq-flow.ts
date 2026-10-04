import type { TenantPaths } from '@yutis/api-client';
import { NMQ_KEYS, type NmqScores } from '@yutis/domain';
import type { TFunction } from 'i18next';
import { isRecord, type DraftFormat } from './drafts';

export interface NmqQuestion { key: string; label: string }

/** One rating step per body part and side, in the domain's NMQ order. */
export function nmqQuestions(t: TFunction<'nmq'>): NmqQuestion[] {
  return NMQ_KEYS.map(k => {
    const part = t(`parts.${k.part}`);
    return { key: k.key, label: k.side ? `${part}（${t(k.side === 'L' ? 'left' : 'right')}）` : part };
  });
}

export interface NmqAnswers {
  /** Discomfort lasting 2+ weeks in the past year. */
  any: boolean | null;
  injury: boolean | null;
  scores: NmqScores;
}

export const emptyNmq = (): NmqAnswers => ({ any: null, injury: null, scores: {} });

const isScore = (raw: unknown) => {
  const v = Number(raw);
  return (typeof raw === 'number' || typeof raw === 'string') && raw !== '' && Number.isInteger(v) && v >= 0 && v <= 5;
};

/** The prototype requires both yes/no questions and a 0–5 score for every part. */
export function nmqComplete(a: NmqAnswers): boolean {
  if (a.any == null || a.injury == null) return false;
  return NMQ_KEYS.every(k => isScore(a.scores[k.key]));
}

/** Steps: the two yes/no questions, then one per body part in NMQ_KEYS order. */
export const nmqSteps = () => NMQ_KEYS.length + 1;

const yesNo = (v: unknown) => (typeof v === 'boolean' ? v : null);

export const NMQ_DRAFT: DraftFormat<NmqAnswers> = {
  empty: emptyNmq,
  read: raw => {
    if (!isRecord(raw)) return null;
    const scores = isRecord(raw.scores) ? raw.scores : {};
    return {
      any: yesNo(raw.any), injury: yesNo(raw.injury),
      scores: Object.fromEntries(NMQ_KEYS.flatMap(k => (isScore(scores[k.key]) ? [[k.key, Number(scores[k.key])]] : []))),
    };
  },
  openStep: a => {
    if (a.any == null || a.injury == null) return 0;
    const part = NMQ_KEYS.findIndex(k => !isScore(a.scores[k.key]));
    return part === -1 ? nmqSteps() - 1 : part + 1;
  },
};

export type NmqBody = TenantPaths['/api/portal/ergo/{id}']['put']['requestBody']['content']['application/json'];

/** PUT /api/portal/ergo/{id}: every body part's score, and the two yes/no answers. */
export function nmqBody(a: NmqAnswers): NmqBody {
  if (!nmqComplete(a)) throw new Error('NMQ is incomplete');
  // The API's score keys are NMQ_KEYS, so this object has exactly the keys the generated type lists.
  const scores = Object.fromEntries(NMQ_KEYS.map(k => [k.key, Number(a.scores[k.key])])) as NmqBody['scores'];
  return { scores, yesNo: { any: a.any!, injury: a.injury! } };
}
