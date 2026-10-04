import type { TenantPaths } from '@yutis/api-client';
import { NMQ_KEYS, type NmqScores } from '@yutis/domain';
import type { TFunction } from 'i18next';

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

/** The prototype requires both yes/no questions and a 0–5 score for every part. */
export function nmqComplete(a: NmqAnswers): boolean {
  if (a.any == null || a.injury == null) return false;
  return NMQ_KEYS.every(k => {
    const raw = a.scores[k.key];
    const v = Number(raw);
    return raw !== undefined && Number.isInteger(v) && v >= 0 && v <= 5;
  });
}

export type NmqBody = TenantPaths['/api/portal/ergo/{id}']['put']['requestBody']['content']['application/json'];

/** PUT /api/portal/ergo/{id}: every body part's score, and the two yes/no answers. */
export function nmqBody(a: NmqAnswers): NmqBody {
  if (!nmqComplete(a)) throw new Error('NMQ is incomplete');
  // The API's score keys are NMQ_KEYS, so this object has exactly the keys the generated type lists.
  const scores = Object.fromEntries(NMQ_KEYS.map(k => [k.key, Number(a.scores[k.key])])) as NmqBody['scores'];
  return { scores, yesNo: { any: a.any!, injury: a.injury! } };
}
