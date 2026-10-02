'use strict';
/* Domain rules: health-check grading, NMQ hazard, overwork risk, maternal levels, violence risk, events and cases. */

/* ---------- lookups ---------- */
const emp = id => S.employees.find(e => e.id === id);
const siteName = id => ORG.sites.find(s => s.id === id)?.name ?? '';
const entName = id => ORG.entities.find(s => s.id === id)?.name ?? '';
const deptName = id => deptOf(id).name;
const staff = id => S.staff.find(s => s.id === id);
const staffName = id => staff(id)?.name ?? '';
/* Dropdown options: active staff in the given roles, plus any inactive person a record already points to. */
function staffOpts(roles = CARE_ROLES, keep = []) {
  const k = [].concat(keep).filter(Boolean);
  return S.staff.filter(s => roles.includes(s.role) && (s.active || k.includes(s.id))).map(s => [s.id, `${s.name}（${s.role}）${s.active ? '' : '・已停用'}`]);
}
/* Open work owned by a staff member: cases they lead and follow-ups assigned to them. */
function staffLoad(id) {
  return {
    cases: Object.entries(S.cases).filter(([, c]) => c.nurse === id && c.status !== '結案').map(([eid]) => eid),
    tasks: tasksOpen().filter(r => r.follow.staff === id),
  };
}
function age(birth, at = D0) {
  const b = parseD(birth);
  let a = at.getFullYear() - b.getFullYear();
  if (at.getMonth() < b.getMonth() || (at.getMonth() === b.getMonth() && at.getDate() < b.getDate())) a--;
  return a;
}
function ageYM(birth) {
  const b = parseD(birth);
  let m = (D0.getFullYear() - b.getFullYear()) * 12 + (D0.getMonth() - b.getMonth());
  if (D0.getDate() < b.getDate()) m--;
  return `${Math.floor(m / 12)} 歲 ${m % 12} 個月`;
}

/* ---------- health-check grading ---------- */
const reportsOf = id => S.reports.filter(r => r.empId === id).sort((a, b) => b.date.localeCompare(a.date));
const latestReport = id => reportsOf(id)[0];
function findRule(code, sex) { return S.rules.find(r => r.code === code && (r.sex === '不限' || r.sex === sex)); }
function levelOf(rule, v) {
  if (v == null || v === '') return null;
  if (rule.type === 'text') { const l = rule.levels.find(l => l.values.includes(v)); return l ? l.lv : null; }
  const x = +v;
  const l = rule.levels.find(l => (l.min == null || x >= l.min) && (l.max == null || x < l.max));
  return l ? l.lv : null;
}
function levelDesc(rule, l) {
  if (rule.type === 'text') return l.values.join('、');
  if (l.min == null) return `< ${l.max}`;
  if (l.max == null) return `≥ ${l.min}`;
  return `≥ ${l.min}，< ${l.max}`;
}
function ruleTip(rule) { return `V1 分級判斷規則（${rule.name}）\n` + rule.levels.map(l => `第 ${l.lv} 級：${levelDesc(rule, l)} ${rule.unit}`).join('\n'); }
function gradeReport(r) {
  const e = emp(r.empId);
  const items = HC_ITEMS.map(it => {
    const rule = findRule(it.code, e.sex);
    const v = r.values[it.key];
    return { ...it, v, rule, lv: rule ? levelOf(rule, v) : null };
  });
  const lv = items.map(i => i.lv || 0);
  return { items, total: lv.reduce((a, b) => a + b, 0), max: Math.max(...lv) };
}

/* ---------- NMQ ---------- */
const nmqMax = s => s && s.nmq ? Math.max(...Object.values(s.nmq).map(Number)) : null;
function nmqHazardLabel(s) {
  if (!s || s.status !== '已填寫') return '';
  const m = nmqMax(s);
  return m >= 3 ? `疑似有危害（${m}）` : '無明顯危害';
}
function partLabel(key, lang = 'zh') {
  const k = NMQ_KEYS.find(x => x.key === key);
  const t = I18N[lang];
  return k.side ? `${t.parts[k.part]}（${k.side === 'L' ? t.left : t.right}）` : t.parts[k.part];
}
const latestErgo = id => S.ergo.filter(s => s.empId === id).sort((a, b) => b.date.localeCompare(a.date))[0];

/* ---------- overwork (異常工作負荷) ---------- */
const RISK_LABEL = ['低度風險', '中度風險', '高度風險'];
const LOAD_LABEL = ['低負荷', '中負荷', '高負荷'];
const ADVICE = ['不需面談', '建議面談', '需面談'];
const MATRIX = [[0, 0, 1], [0, 1, 2], [1, 2, 2]]; // [10-year CVD band][workload level]

/* Simplified Framingham point score (LDL version). Prototype illustration; production uses the guideline's own tables. */
const CVD = {
  M: { age: [-1, 0, 1, 2, 3, 4, 5, 6, 7], ldl: [-3, 0, 0, 1, 2], hdl: [2, 1, 0, 0, -1], bp: [0, 0, 1, 2, 3], dm: 2, smoke: 2,
    risk: p => p <= -3 ? 1 : ({ '-2': 2, '-1': 2, 0: 3, 1: 4, 2: 4, 3: 6, 4: 7, 5: 9, 6: 11, 7: 14, 8: 18, 9: 22, 10: 27, 11: 33, 12: 40, 13: 47 })[p] ?? 56 },
  F: { age: [-9, -4, 0, 3, 6, 7, 8, 8, 8], ldl: [-2, 0, 0, 2, 2], hdl: [5, 2, 1, 0, -2], bp: [-3, 0, 0, 2, 3], dm: 4, smoke: 2,
    risk: p => p <= -2 ? 1 : ({ '-1': 2, 0: 2, 1: 2, 2: 3, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 11, 11: 13, 12: 15, 13: 17, 14: 20, 15: 24, 16: 27 })[p] ?? 32 },
};
function cvdScore(e, r) {
  if (!r) return null;
  const T = e.sex === '男' ? CVD.M : CVD.F;
  const v = r.values;
  const a = age(e.birth, parseD(r.date));
  const ai = Math.min(8, Math.max(0, Math.floor((a - 30) / 5)));
  const ldl = +v.LDL, hdl = +v.HDL, sbp = +v.SBP, dbp = +v.DBP;
  const li = ldl < 100 ? 0 : ldl < 130 ? 1 : ldl < 160 ? 2 : ldl < 190 ? 3 : 4;
  const hi = hdl < 35 ? 0 : hdl < 45 ? 1 : hdl < 50 ? 2 : hdl < 60 ? 3 : 4;
  const bi = (sbp >= 160 || dbp >= 100) ? 4 : (sbp >= 140 || dbp >= 90) ? 3 : (sbp >= 130 || dbp >= 85) ? 2 : (sbp >= 120 || dbp >= 80) ? 1 : 0;
  const dm = +v.GLU >= 126 || /糖尿病/.test(r.history || '');
  const smoke = !!r.life?.smoke;
  const items = [
    { name: '年齡', value: `${a} 歲`, pts: T.age[ai] },
    { name: '低密度脂蛋白膽固醇', value: `${ldl} mg/dL`, pts: T.ldl[li] },
    { name: '高密度脂蛋白膽固醇', value: `${hdl} mg/dL`, pts: T.hdl[hi] },
    { name: '血壓', value: `${sbp}/${dbp} mmHg`, pts: T.bp[bi] },
    { name: '糖尿病', value: dm ? '有' : '無', pts: dm ? T.dm : 0 },
    { name: '吸菸', value: smoke ? '有' : '無', pts: smoke ? T.smoke : 0 },
  ];
  const total = items.reduce((s, i) => s + i.pts, 0);
  const risk = T.risk(total);
  return { items, total, risk, band: risk >= 20 ? 2 : risk >= 10 ? 1 : 0, reportDate: r.date, extra: { 脈搏: '—', 三酸甘油脂: `${v.TG} mg/dL`, 空腹血糖: `${v.GLU} mg/dL`, 尿蛋白: v.UPRO } };
}
function loadEval(a) {
  if (a.pf == null || a.m1 == null) return null;
  const lp = a.pf > 70 ? 2 : a.pf >= 50 ? 1 : 0;
  const lw = a.wf > 60 ? 2 : a.wf >= 45 ? 1 : 0;
  const lo = (a.m1 > 100 || a.avg6 > 80) ? 2 : (a.m1 >= 45 || a.avg6 >= 45) ? 1 : 0;
  const n = a.patterns.length;
  const lt = n >= 4 ? 2 : n >= 2 ? 1 : 0;
  const items = [
    { name: '個人相關過勞', value: `${a.pf} 分`, lv: lp },
    { name: '工作相關過勞', value: `${a.wf} 分`, lv: lw },
    { name: '月加班時數', value: `近 1 個月 ${a.m1} 小時；近 6 個月平均 ${a.avg6} 小時`, lv: lo },
    { name: '工作型態', value: `${n} 項`, lv: lt },
  ];
  return { items, level: Math.max(lp, lw, lo, lt), ot: lo };
}
function evalWorkload(a) {
  const e = emp(a.empId);
  const cvd = cvdScore(e, latestReport(a.empId));
  const load = loadEval(a);
  if (!cvd || !load) return { cvd, load, complete: false };
  const lv = MATRIX[cvd.band][load.level];
  const shortM = lv === 0 ? '—' : lv === 1 ? (load.ot >= 1 ? '限制加班 10 小時／月' : '調整工作型態') : (load.ot >= 1 ? '不宜加班' : '限制工作時間 09:00–18:00');
  const longM = [
    '維持現行工作安排，持續健康促進並於下次健檢後重新評估。',
    '建議改變生活型態，考慮醫療協助，調整工作型態，至少每半年追蹤一次。',
    '應盡速安排醫師面談，不宜加班並限制工作時間，必要時考慮醫療協助，至少每 3 個月追蹤一次。',
  ][lv];
  return { cvd, load, complete: true, riskLevel: lv, advice: ADVICE[lv], shortM, longM };
}
function cbiScores(ans) {
  const val = i => [100, 75, 50, 25, 0][i];
  const p = ans.p.map(val);
  const w = ans.w.map((x, i) => CBI.work[i].rev ? 100 - val(x) : val(x));
  const avg = arr => +(arr.reduce((s, x) => s + x, 0) / arr.length).toFixed(1);
  return { pf: avg(p), wf: avg(w) };
}

/* ---------- maternal ---------- */
function matSuggest(hz) {
  const vals = Object.values(hz || {}).map(h => h.v);
  return vals.includes('有') ? '第三級管理' : vals.includes('可能有影響') ? '第二級管理' : '第一級管理';
}
function pregWeeks(m) {
  if (m.type !== '妊娠' || !m.due) return '';
  const w = 40 - Math.ceil(diffDays(m.due, TODAY) / 7);
  return w > 0 ? `${w} 週` : '';
}
const levelPill = lv => lv === '第三級管理' ? 'bad' : lv === '第二級管理' ? 'warn' : 'ok';

/* ---------- violence risk ---------- */
function vioLevel(lik, sev) {
  if (!lik || !sev) return '';
  const s = (3 - VIO_LIK.indexOf(lik)) * (3 - VIO_SEV.indexOf(sev));
  return s >= 6 ? '高度風險' : s >= 3 ? '中度風險' : '低度風險';
}

/* ---------- events and cases ---------- */
const EV = {
  hc: { l: '健檢報告分級3、4級', s: '健檢 3–4 級' },
  wl: { l: '異常工作負荷', s: '異常負荷' },
  er: { l: '人因性危害', s: '人因' },
  mat: { l: '母性健康保護', s: '母性' },
  age: { l: '18歲以下或中高齡', s: '年齡關注' },
  sp: { l: '特殊健檢異常', s: '特殊健檢' },
};
const EV_KEYS = Object.keys(EV);
const ST = ['未開單', '起單', '處理中', '結案'];
const SENIOR_AGE = 55;

function allEvents() {
  const ev = [];
  const latest = {};
  for (const r of S.reports) if (!latest[r.empId] || r.date > latest[r.empId].date) latest[r.empId] = r;
  for (const r of Object.values(latest)) {
    const g = gradeReport(r);
    if (g.max >= 3) ev.push({ key: 'hc:' + r.id, empId: r.empId, type: 'hc', date: r.date, desc: `健康檢查／體格檢查報告異常：最大級 ${g.max} 級（總分 ${g.total}）` });
    if (r.special && r.special.level >= 2) ev.push({ key: 'sp:' + r.id, empId: r.empId, type: 'sp', date: r.date, desc: `特殊健檢異常：${r.special.hazard}第 ${r.special.level} 級管理` });
  }
  for (const a of S.workload) {
    const w = evalWorkload(a);
    if (w.complete && w.riskLevel >= 1) ev.push({ key: 'wl:' + a.id, empId: a.empId, type: 'wl', date: [a.fatigueAt, a.overloadAt].sort().pop(), desc: `異常工作負荷促發疾病：${RISK_LABEL[w.riskLevel]}，${w.advice}` });
  }
  for (const s of S.ergo) {
    const m = nmqMax(s);
    if (s.status === '已填寫' && m >= 3) ev.push({ key: 'er:' + s.id, empId: s.empId, type: 'er', date: s.filledAt, desc: `人因性危害：肌肉骨骼症狀疑似有危害（${m}）` });
  }
  for (const m of S.matCases) ev.push({ key: 'mat:' + m.id, empId: m.empId, type: 'mat', date: m.notifyDate, desc: `工作場所母性健康保護：${m.type}通報` });
  for (const e of S.employees) {
    const a = age(e.birth);
    if (a < 18 || a >= SENIOR_AGE) ev.push({ key: 'age:' + e.id, empId: e.id, type: 'age', date: e.hire, desc: a < 18 ? `未滿 18 歲員工（${a} 歲）` : `中高齡員工（${a} 歲）` });
  }
  return ev.map(x => ({ ...x, status: S.evStatus[x.key] || '未開單' }));
}
function eventsByEmp() {
  const map = {};
  for (const e of allEvents()) (map[e.empId] ||= []).push(e);
  for (const k in map) map[k].sort((a, b) => EV_KEYS.indexOf(a.type) - EV_KEYS.indexOf(b.type));
  return map;
}
function caseStatus(id, evs) {
  const c = S.cases[id];
  const anyNew = (evs || []).some(e => e.status === '未開單');
  if (!c) return '未開單';
  if (c.status === '結案' && anyNew) return '未開單';
  return c.status;
}
function ensureCase(id) {
  let c = S.cases[id];
  if (!c || c.status === '結案') {
    c = S.cases[id] = { openDate: TODAY, nurse: c?.nurse || ME, status: '起單', noticeDate: null, plannedDate: null, replyDate: null, agree: null, closedDate: null };
  }
  return c;
}
function setEventStatus(id, to, from = null) {
  for (const e of allEvents()) {
    if (e.empId !== id) continue;
    if (from && !from.includes(e.status)) continue;
    S.evStatus[e.key] = to;
  }
}
function initEventStatus() {
  for (const e of allEvents()) {
    const c = S.cases[e.empId];
    if (c) S.evStatus[e.key] = c.status;
  }
  // a fresh abnormal result arriving on an open case stays 未開單 until the nurse acts
  const late = allEvents().find(e => e.empId === empId(2) && e.type === 'er');
  if (late) S.evStatus[late.key] = '未開單';
}
const stIdx = s => Math.max(0, ST.indexOf(s));
const tasksOpen = () => S.records.filter(r => r.result === '追蹤' && !r.draft && !r.followDone && r.follow);
