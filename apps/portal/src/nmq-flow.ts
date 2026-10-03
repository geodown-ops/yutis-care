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
