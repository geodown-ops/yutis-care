import { CBI_PERSONAL_ITEMS, CBI_WORK_ITEMS, WORK_PATTERNS } from '@yutis/domain';
import { describe, expect, it } from 'vitest';
import i18n, { LANG_CODES } from './i18n';
import app from './locales/app.json';
import nmq from './locales/nmq.json';
import workload from './locales/workload.json';

/** Plural forms differ by language (English has _one, Chinese does not), so compare keys without them. */
const keys = (o: object, p = ''): string[] => [...new Set(Object.entries(o).flatMap(([k, v]) => (
  v && typeof v === 'object' && !Array.isArray(v) ? keys(v, `${p}${k}.`) : [`${p}${k.replace(/_(zero|one|two|few|many|other)$/, '')}`]
)))];

describe('translations', () => {
  it('every language has the same keys as Chinese', () => {
    for (const l of LANG_CODES) {
      expect(keys(app[l]), `app ${l}`).toEqual(keys(app.zh));
      expect(keys(nmq[l]), `nmq ${l}`).toEqual(keys(nmq.zh));
      expect(keys(workload[l]), `workload ${l}`).toEqual(keys(workload.zh));
    }
  });

  it('every list has its full length', () => {
    for (const l of LANG_CODES) {
      expect(nmq[l].scale, `scale ${l}`).toHaveLength(6);
      expect(workload[l].cbi.p, `cbi.p ${l}`).toHaveLength(CBI_PERSONAL_ITEMS);
      expect(workload[l].cbi.w, `cbi.w ${l}`).toHaveLength(CBI_WORK_ITEMS);
      expect(workload[l].cbi.freq, `cbi.freq ${l}`).toHaveLength(5);
      expect(workload[l].cbi.degree, `cbi.degree ${l}`).toHaveLength(5);
      expect(workload[l].overload.patterns, `patterns ${l}`).toHaveLength(WORK_PATTERNS.length);
      expect(app[l].health.grades, `grades ${l}`).toHaveLength(4);
      for (const k of ['burnout', 'risk', 'advice'] as const) expect(app[l].health[k], `${k} ${l}`).toHaveLength(3);
    }
  });

  it('the Chinese work patterns are the values the API takes', () => {
    expect(workload.zh.overload.patterns).toEqual([...WORK_PATTERNS]);
  });

  it('greets with no tasks, one task and several', () => {
    const zh = i18n.getFixedT('zh');
    expect(zh('tasks.greeting', { name: '林志豪', count: 0 })).toBe('林志豪，目前沒有待辦');
    expect(zh('tasks.greeting', { name: '林志豪', count: 2 })).toBe('林志豪，你有 2 件待辦');
    const en = i18n.getFixedT('en');
    expect(en('tasks.greeting', { name: 'Lin', count: 1 })).toBe('Lin, you have 1 thing to do');
    expect(en('tasks.greeting', { name: 'Lin', count: 3 })).toBe('Lin, you have 3 things to do');
  });
});
