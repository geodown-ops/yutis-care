/*
 * Runs the prototype's own data.js + logic.js on its seed data and checks the ported rules give
 * identical results, so the production rules start from exactly what users reviewed in the prototype.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import {
  cvdScore, evaluateWorkload, gradeReport, loadEval, nmqHazardLabel, suggestMaternalLevel, toIsoDate, violenceRisk,
} from '../src/index.js';

const dir = fileURLToPath(new URL('../../../prototype/', import.meta.url));
const src = ['data.js', 'logic.js'].map(f => readFileSync(dir + f, 'utf8')).join('\n;\n');
const ctx = vm.createContext({ console });
vm.runInContext(`${src}
;var S = seedState(); initEventStatus();
globalThis.out = {
  today: TODAY,
  employees: S.employees,
  reports: S.reports.map(r => ({ r, g: gradeReport(r) })),
  workload: S.workload.map(a => ({ a, latest: latestReport(a.empId), w: evalWorkload(a) })),
  ergo: S.ergo.map(s => ({ nmq: s.nmq, status: s.status, label: nmqHazardLabel(s) })),
  matEnv: S.matEnv.map(m => ({ hazards: m.hazards, level: matSuggest(m.hazards) })),
  vio: ['可能', '不太可能', '極不可能'].flatMap(l => ['嚴重', '中', '輕'].map(s => ({ l, s, v: vioLevel(l, s) }))),
};`, ctx);
const out = JSON.parse(JSON.stringify((ctx as any).out));
const emp = (id: string) => out.employees.find((e: any) => e.id === id);

describe('parity with prototype logic.js', () => {
  it('runs against today', () => expect(out.today).toBe(toIsoDate(new Date())));

  it('grades every seeded report the same', () => {
    expect(out.reports.length).toBeGreaterThan(20);
    for (const { r, g } of out.reports) {
      const ours = gradeReport(r.values, emp(r.empId).sex);
      expect({ total: ours.total, max: ours.max, lv: ours.items.map(i => i.lv) }, r.id)
        .toEqual({ total: g.total, max: g.max, lv: g.items.map((i: { lv: number | null }) => i.lv) });
    }
  });

  it('evaluates every seeded overwork assessment the same', () => {
    for (const { a, latest, w } of out.workload) {
      const e = emp(a.empId);
      const cvd = latest ? cvdScore({ sex: e.sex, birth: e.birth, report: { date: latest.date, values: latest.values, history: latest.history, smoker: !!latest.life?.smoke } }) : null;
      const ours = evaluateWorkload(cvd, loadEval(a));
      expect(ours.complete, a.id).toBe(w.complete);
      if (ours.complete) {
        expect({ total: ours.cvd.total, risk: ours.cvd.risk, band: ours.cvd.band, load: ours.load.level, lv: ours.riskLevel, advice: ours.advice, shortM: ours.shortM, longM: ours.longM }, a.id)
          .toEqual({ total: w.cvd.total, risk: w.cvd.risk, band: w.cvd.band, load: w.load.level, lv: w.riskLevel, advice: w.advice, shortM: w.shortM, longM: w.longM });
      }
    }
  });

  it('labels every seeded NMQ survey the same', () => {
    for (const s of out.ergo) if (s.status === '已填寫') expect(nmqHazardLabel(s.nmq)).toBe(s.label);
  });

  it('suggests the same maternal levels and violence risks', () => {
    for (const m of out.matEnv) expect(suggestMaternalLevel(m.hazards)).toBe(m.level);
    for (const v of out.vio) expect(violenceRisk(v.l, v.s)).toBe(v.v);
  });
});
