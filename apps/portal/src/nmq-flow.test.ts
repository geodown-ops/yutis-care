import { NMQ_KEYS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import i18n, { LANG_CODES } from './i18n';
import { nmqComplete, nmqQuestions } from './nmq-flow';
import app from './locales/app.json';
import nmq from './locales/nmq.json';

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
});

describe('translations', () => {
  const keys = (o: object, p = ''): string[] => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k}`]));

  it('every language has the same keys as Chinese', () => {
    for (const l of LANG_CODES) {
      expect(keys(app[l]), `app ${l}`).toEqual(keys(app.zh));
      expect(keys(nmq[l]), `nmq ${l}`).toEqual(keys(nmq.zh));
      expect(nmq[l].scale, `scale ${l}`).toHaveLength(6);
    }
  });
});
