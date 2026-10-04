import { NMQ_KEYS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import i18n from './i18n';
import { nmqBody, nmqComplete, nmqQuestions } from './nmq-flow';

describe('NMQ flow', () => {
  it('has one rating step per body part and side', () => {
    const qs = nmqQuestions(i18n.getFixedT('zh', 'nmq'));
    expect(qs).toHaveLength(NMQ_KEYS.length);
    expect(qs.find(q => q.key === 'wristR')?.label).toBe('手／手腕（右）');
    expect(nmqQuestions(i18n.getFixedT('en', 'nmq')).find(q => q.key === 'neck')?.label).toBe('Neck');
  });

  it('needs both yes/no answers and every score', () => {
    const scores = Object.fromEntries(NMQ_KEYS.map(k => [k.key, 0]));
    expect(nmqComplete({ any: false, injury: false, scores })).toBe(true);
    expect(nmqComplete({ any: null, injury: false, scores })).toBe(false);
    expect(nmqComplete({ any: true, injury: false, scores: { ...scores, neck: 6 } })).toBe(false);
    const { neck: _omit, ...missing } = scores;
    expect(nmqComplete({ any: true, injury: true, scores: missing })).toBe(false);
  });

  it('sends every body part as a number, and the yes/no answers', () => {
    const scores = Object.fromEntries(NMQ_KEYS.map((k, i) => [k.key, String(i % 6)]));
    const body = nmqBody({ any: true, injury: false, scores });
    expect(Object.keys(body.scores).sort()).toEqual(NMQ_KEYS.map(k => k.key).sort());
    expect(body.scores.shoulderL).toBe(1);
    expect(body.yesNo).toEqual({ any: true, injury: false });
    expect(() => nmqBody({ any: true, injury: null, scores })).toThrow();
  });
});
