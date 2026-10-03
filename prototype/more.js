'use strict';
/* Yutis Care prototype: case management, reports, settings, employee portal, boot. */

/* ====================================================================
   CASE MANAGEMENT (個案管理)
   ==================================================================== */
function caseRows() {
  const f = fval('cases', { status: 'open' });
  const types = UI.f.caseTypes || [];
  return Object.entries(eventsByEmp()).map(([id, evs]) => {
    const r = latestReport(id);
    const a = S.workload.filter(x => x.empId === id).sort((x, y) => y.date.localeCompare(x.date))[0];
    return { e: emp(id), evs, st: caseStatus(id, evs), c: S.cases[id], r, g: r ? gradeReport(r) : null, w: a ? evalWorkload(a) : null, s: latestErgo(id), m: S.matCases.find(x => x.empId === id) };
  }).filter(x => orgMatch(x.e, f) && kwMatch(x.e, f.kw) && inRange(x.r?.date, f, 'hc')
    && (!f.status || (f.status === 'open' ? x.st !== '結案' : x.st === f.status))
    && types.every(t => x.evs.some(ev => ev.type === t)))
    .sort((a, b) => stIdx(a.st) - stIdx(b.st) || (b.g?.max || 0) - (a.g?.max || 0));
}
const evDot = (x, type) => { const ev = x.evs.find(e => e.type === type); return ev ? ` <i class="dot st${stIdx(ev.status)}" title="${esc(ev.status)}"></i>` : ''; };
VIEWS.cases = {
  title: () => '個案管理',
  render() {
    const rows = caseRows();
    const types = UI.f.caseTypes || [];
    return `<div class="page-head"><div><h1>個案管理</h1><p class="sub">健檢與各計畫資料匯入後自動分級並產生異常追蹤個案；同一員工的多個事件整合在同一張個案服務單。</p></div><div class="acts"><button class="btn" data-act="go" data-to="rules">分級標準</button></div></div>
    <div class="panel">${filterForm('cases', [{ k: 'hc', label: '健檢日期', type: 'date2' }, ...ORG_FILTERS, { k: 'status', label: '個案狀態', type: 'select', def: 'open', opts: [['open', '未結案'], ...ST.map(s => [s, s])] }, KW_FILTER])}
      <div class="typechips"><b>異常類型（可複選，取交集）</b>${EV_KEYS.map(k => `<label class="tchip"><input type="checkbox" value="${k}" ${types.includes(k) ? 'checked' : ''} data-change="caseType">${esc(EV[k].l)}</label>`).join('')}${types.length ? '<button class="btn link" data-act="caseTypeClear">清除類型</button>' : ''}</div>
      <div class="toolbar"><span class="legend"><span><i class="dot st2"></i>處理中</span><span><i class="dot st3"></i>結案、封存</span><span><i class="dot st0"></i>未開單</span><span><i class="dot st1"></i>起單</span></span><span class="sp"></span><span class="muted">共 ${rows.length} 人</span><button class="btn sm" data-act="exportCases">匯出</button></div>
      ${tbl([
        { h: '工號', f: x => `<span class="mono">${x.e.empNo}</span>` },
        { h: '姓名', f: x => `${nameBtn(x.e)}<span class="sub2">${x.e.id}</span>` },
        { h: '廠區', f: x => esc(siteName(x.e.site)) }, { h: '部門', f: x => esc(deptName(x.e.dept)) },
        { h: '健檢日期', cls: 'nowrap', f: x => fmtD(x.r?.date) || '—' }, { h: '總分', cls: 'num', f: x => x.g?.total ?? '—' },
        { h: '最大級', f: x => x.g ? gb(x.g.max) + evDot(x, 'hc') : '—' },
        { h: '異常工作負荷', cls: 'nowrap', f: x => x.w?.complete && x.w.riskLevel >= 1 ? esc(x.w.advice) + evDot(x, 'wl') : '<span class="faint">—</span>' },
        { h: '人因性危害', cls: 'nowrap', f: x => nmqMax(x.s) >= 3 ? esc(nmqHazardLabel(x.s)) + evDot(x, 'er') : '<span class="faint">—</span>' },
        { h: '母性健康保護', f: x => x.m ? esc(x.m.type) + evDot(x, 'mat') : '<span class="faint">—</span>' },
        { h: '關注年齡', cls: 'nowrap', f: x => { const a = age(x.e.birth); return a < 18 || a >= 45 ? esc(ageYM(x.e.birth)) + evDot(x, 'age') : '<span class="faint">—</span>'; } },
        { h: '個案狀態', f: x => stPill(x.st) }, { h: '任務開始日', cls: 'nowrap', f: x => x.c && x.st !== '未開單' ? fmtD(x.c.openDate) : '—' }, { h: '負責人員', f: x => x.c && x.st !== '未開單' ? esc(staffName(x.c.nurse)) : '—' },
      ], rows, { empty: '沒有符合條件的個案' })}</div>`;
  },
};
ACT.caseType = el => { const s = new Set(UI.f.caseTypes || []); el.checked ? s.add(el.value) : s.delete(el.value); UI.f.caseTypes = [...s]; render(); };
ACT.caseTypeClear = () => { UI.f.caseTypes = []; render(); };
ACT.exportCases = () => exportCsv('個案管理', [
  { h: '工號', v: x => x.e.empNo }, { h: '帳號', v: x => x.e.id }, { h: '姓名', v: x => x.e.name }, { h: '廠區', v: x => siteName(x.e.site) }, { h: '部門', v: x => deptName(x.e.dept) },
  { h: '健檢日期', v: x => x.r?.date || '' }, { h: '總分', v: x => x.g?.total ?? '' }, { h: '最大級', v: x => x.g?.max ?? '' }, { h: '異常類型', v: x => x.evs.map(e => EV[e.type].l).join('；') },
  { h: '個案狀態', v: x => x.st }, { h: '負責人員', v: x => staffName(x.c?.nurse) },
], caseRows());

/* ====================================================================
   REPORTS (統計分析報表)
   ==================================================================== */
const REPORT_TYPES = {
  health: [['grade', '健管級數占比分析'], ['trend', '健管級數年度變化（母群體相同）'], ['events', '個案事件統計（事件）'], ['status', '個案事件狀態統計'], ['items', '分級異常前 5 大項目比較'], ['depts', '分級異常前 5 大部門比較'], ['records', '面談次數統計（協助類別）']],
  wl: [['cvd', '十年內心血管疾病'], ['risk', '職業促發腦心血管疾病'], ['fatigue', '過勞量表'], ['ot', '長時間工作'], ['pattern', '工作型態評估'], ['smoke', '吸菸']],
  ergo: [['part', '部位異常占比比較'], ['dept', '部門異常比較'], ['fill', '問卷填答率']],
};
const pct = (a, b) => b ? (a / b * 100).toFixed(1) : '0.0';
const GCOL = ['g1', 'g2', 'g3', 'g4'];
const REPORTS = {
  health: {
    grade(emps) {
      const gs = emps.map(e => latestReport(e.id)).filter(Boolean).map(gradeReport);
      const rows = [1, 2, 3, 4].map(l => ({ k: `第 ${l} 級`, n: gs.filter(g => g.max === l).length }));
      return { sum: [[gs.length, '受檢人數'], [rows[2].n + rows[3].n, '3–4 級人數'], [pct(rows[2].n + rows[3].n, gs.length) + '%', '3–4 級占比']], chart: stackBar(rows.map((r, i) => ({ label: r.k, value: r.n, color: GCOL[i] }))), cols: ['最大級', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, gs.length) + '%']) };
    },
    trend(emps) {
      const pairs = emps.map(e => reportsOf(e.id)).filter(rs => rs.length >= 2).map(rs => [gradeReport(rs[1]).max, gradeReport(rs[0]).max]);
      const cnt = (k, l) => pairs.filter(p => p[k] === l).length;
      return { sum: [[pairs.length, '兩年皆受檢人數'], [pairs.filter(p => p[1] > p[0]).length, '級數上升'], [pairs.filter(p => p[1] < p[0]).length, '級數下降']],
        chart: `<p class="muted" style="margin:0 0 6px">前次</p>${stackBar([1, 2, 3, 4].map((l, i) => ({ label: `第 ${l} 級`, value: cnt(0, l), color: GCOL[i] })))}<p class="muted" style="margin:14px 0 6px">本次</p>${stackBar([1, 2, 3, 4].map((l, i) => ({ label: `第 ${l} 級`, value: cnt(1, l), color: GCOL[i] })))}`,
        cols: ['最大級', '前次人數', '本次人數'], rows: [1, 2, 3, 4].map(l => [`第 ${l} 級`, cnt(0, l), cnt(1, l)]) };
    },
    events(emps) {
      const ids = new Set(emps.map(e => e.id));
      const ev = allEvents().filter(e => ids.has(e.empId));
      const rows = EV_KEYS.map(k => ({ k: EV[k].l, n: ev.filter(e => e.type === k).length })).sort((a, b) => b.n - a.n);
      return { sum: [[ev.length, '事件數'], [new Set(ev.map(e => e.empId)).size, '涉及人數']], chart: bars(rows.map(r => ({ label: r.k, value: r.n, display: `${r.n} 件` }))), cols: ['事件', '次數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, ev.length) + '%']) };
    },
    status(emps) {
      const ids = new Set(emps.map(e => e.id));
      const ev = allEvents().filter(e => ids.has(e.empId));
      const rows = ST.map(s => ({ k: s, n: ev.filter(e => e.status === s).length }));
      return { sum: [[ev.length, '事件數'], [rows[0].n, '未開單']], chart: stackBar(rows.map((r, i) => ({ label: r.k, value: r.n, color: ['bad', 'info', 'warn', 'ok'][i] }))), cols: ['事件狀態', '件數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, ev.length) + '%']) };
    },
    items(emps) {
      const gs = emps.map(e => latestReport(e.id)).filter(Boolean).map(gradeReport);
      const rows = HC_ITEMS.map(it => ({ k: it.name, n: gs.filter(g => (g.items.find(i => i.key === it.key)?.lv || 0) >= 2).length })).sort((a, b) => b.n - a.n).slice(0, 5);
      return { sum: [[gs.length, '受檢人數']], chart: bars(rows.map(r => ({ label: r.k, value: +pct(r.n, gs.length), display: `${pct(r.n, gs.length)}%`, color: 'g3' })), { max: 100 }), cols: ['項目', '異常人數（≥2 級）', '受檢人數', '異常率'], rows: rows.map(r => [r.k, r.n, gs.length, pct(r.n, gs.length) + '%']) };
    },
    depts(emps) {
      const rows = ORG.depts.map(d => { const es = emps.filter(e => e.dept === d.id && latestReport(e.id)); const n = es.filter(e => gradeReport(latestReport(e.id)).max >= 3).length; return { k: `${siteName(d.site)}／${d.name}`, n, t: es.length }; }).filter(r => r.t).sort((a, b) => b.n / b.t - a.n / a.t).slice(0, 5);
      return { sum: [[rows.reduce((s, r) => s + r.n, 0), '3–4 級人數']], chart: bars(rows.map(r => ({ label: r.k, value: +pct(r.n, r.t), display: `${pct(r.n, r.t)}%`, color: 'g3' })), { max: 100 }), cols: ['部門', '3–4 級人數', '受檢人數', '比率'], rows: rows.map(r => [r.k, r.n, r.t, pct(r.n, r.t) + '%']) };
    },
    records(emps) {
      const ids = new Set(emps.map(e => e.id));
      const rs = S.records.filter(r => !r.draft && ids.has(r.empId));
      const rows = ASSIST_CATS.map(c => ({ k: c, n: rs.filter(r => r.cat === c).length })).sort((a, b) => b.n - a.n);
      return { sum: [[rs.length, '協助紀錄'], [rs.reduce((s, r) => s + r.helpers.reduce((t, h) => t + h.min, 0), 0), '累計費時（分）']], chart: bars(rows.map(r => ({ label: r.k, value: r.n, display: `${r.n} 次` }))), cols: ['協助類別', '次數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, rs.length) + '%']) };
    },
  },
  wl: {
    cvd(emps) {
      const ws = wlOf(emps).filter(w => w.cvd);
      const bands = [['極高（>30%）', w => w.cvd.risk > 30, 'crit'], ['高度（20–30%）', w => w.cvd.risk >= 20 && w.cvd.risk <= 30, 'bad'], ['中度（10–20%）', w => w.cvd.risk >= 10 && w.cvd.risk < 20, 'warn'], ['低度（<10%）', w => w.cvd.risk < 10, 'ok']];
      const rows = bands.map(([k, fn, c]) => ({ k, n: ws.filter(fn).length, c }));
      return { sum: [[ws.length, '有健檢資料'], [rows[0].n + rows[1].n, '高度以上']], chart: stackBar(rows.map(r => ({ label: r.k, value: r.n, color: r.c }))), cols: ['風險程度', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, ws.length) + '%']) };
    },
    risk(emps) {
      const ws = wlOf(emps).filter(w => w.complete);
      const rows = [0, 1, 2].map(l => ({ k: `${l}：${RISK_LABEL[l]}`, n: ws.filter(w => w.riskLevel === l).length }));
      return { sum: [[ws.length, '完成評估'], [rows[1].n + rows[2].n, '需／建議面談']], chart: stackBar(rows.map((r, i) => ({ label: r.k, value: r.n, color: ['ok', 'warn', 'bad'][i] }))), cols: ['風險等級', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, ws.length) + '%']) };
    },
    fatigue(emps) {
      const as = asOf(emps).filter(a => a.pf != null);
      const lv = (v, a, b) => v > b ? 2 : v >= a ? 1 : 0;
      const names = ['輕微', '中度', '嚴重'];
      const p = [0, 1, 2].map(l => as.filter(a => lv(a.pf, 50, 70) === l).length);
      const w = [0, 1, 2].map(l => as.filter(a => lv(a.wf, 45, 60) === l).length);
      return { sum: [[as.length, '完成過勞量表']], chart: `<p class="muted" style="margin:0 0 6px">個人相關過勞</p>${stackBar(p.map((n, i) => ({ label: names[i], value: n, color: ['ok', 'warn', 'bad'][i] })))}<p class="muted" style="margin:14px 0 6px">工作相關過勞</p>${stackBar(w.map((n, i) => ({ label: names[i], value: n, color: ['ok', 'warn', 'bad'][i] })))}`,
        cols: ['等級', '個人相關過勞', '工作相關過勞'], rows: names.map((n, i) => [n, p[i], w[i]]) };
    },
    ot(emps) {
      const as = asOf(emps).filter(a => a.m1 != null);
      const bands = [['<45 小時', a => a.m1 < 45, 'ok'], ['45–80 小時', a => a.m1 >= 45 && a.m1 <= 80, 'warn'], ['80–100 小時', a => a.m1 > 80 && a.m1 <= 100, 'g3'], ['>100 小時', a => a.m1 > 100, 'bad']];
      const rows = bands.map(([k, fn, c]) => ({ k, n: as.filter(fn).length, c }));
      return { sum: [[as.length, '完成過負荷評估'], [as.filter(a => a.m1 >= 45).length, '近 1 月加班 ≥45 小時']], chart: stackBar(rows.map(r => ({ label: r.k, value: r.n, color: r.c }))), cols: ['近 1 個月加班', '人數', '百分比'], rows: rows.map(r => [r.k, r.n, pct(r.n, as.length) + '%']) };
    },
    pattern(emps) {
      const as = asOf(emps).filter(a => a.m1 != null);
      const rows = WORK_PATTERNS.map(p => ({ k: p, n: as.filter(a => a.patterns.includes(p)).length })).sort((a, b) => b.n - a.n);
      return { sum: [[as.length, '完成評估']], chart: bars(rows.map(r => ({ label: r.k, value: r.n, display: `${r.n} 人` }))), cols: ['工作型態', '人數', '占比'], rows: rows.map(r => [r.k, r.n, pct(r.n, as.length) + '%']) };
    },
    smoke(emps) {
      const ids = [...new Set(asOf(emps).map(a => a.empId))];
      const sm = ids.filter(id => latestReport(id)?.life?.smoke).length;
      return { sum: [[ids.length, '評估人數'], [sm, '吸菸人數']], chart: stackBar([{ label: '吸菸', value: sm, color: 'bad' }, { label: '不吸菸', value: ids.length - sm, color: 'ok' }]), cols: ['吸菸', '人數', '百分比'], rows: [['吸菸', sm, pct(sm, ids.length) + '%'], ['不吸菸', ids.length - sm, pct(ids.length - sm, ids.length) + '%']] };
    },
  },
  ergo: {
    part(emps) {
      const ss = ergoOf(emps);
      const rows = NMQ_KEYS.map(k => ({ k: partLabel(k.key), n: ss.filter(s => s.nmq[k.key] >= 3).length })).sort((a, b) => b.n - a.n);
      return { sum: [[ss.length, '已填寫'], [ss.filter(s => nmqMax(s) >= 3).length, '疑似有危害人數']], chart: bars(rows.map(r => ({ label: r.k, value: +pct(r.n, ss.length), display: `${pct(r.n, ss.length)}%`, color: 'bad' })), { max: 100 }), cols: ['部位', '人數（≥3 分）', '總人數', '百分比'], rows: rows.map(r => [r.k, r.n, ss.length, pct(r.n, ss.length) + '%']) };
    },
    dept(emps) {
      const ss = ergoOf(emps);
      const rows = ORG.depts.map(d => { const ds = ss.filter(s => emp(s.empId).dept === d.id); return { k: `${siteName(d.site)}／${d.name}`, n: ds.filter(s => nmqMax(s) >= 3).length, t: ds.length }; }).filter(r => r.t).sort((a, b) => b.n / b.t - a.n / a.t);
      return { sum: [[ss.length, '已填寫']], chart: bars(rows.map(r => ({ label: r.k, value: +pct(r.n, r.t), display: `${pct(r.n, r.t)}%`, color: 'bad' })), { max: 100 }), cols: ['部門', '疑似有危害', '已填寫', '比率'], rows: rows.map(r => [r.k, r.n, r.t, pct(r.n, r.t) + '%']) };
    },
    fill(emps) {
      const ids = new Set(emps.map(e => e.id));
      const all = S.ergo.filter(s => ids.has(s.empId));
      const rows = ORG.depts.map(d => { const ds = all.filter(s => emp(s.empId).dept === d.id); return { k: `${siteName(d.site)}／${d.name}`, n: ds.filter(s => s.status === '已填寫').length, t: ds.length }; }).filter(r => r.t);
      return { sum: [[all.length, '已發送'], [pct(all.filter(s => s.status === '已填寫').length, all.length) + '%', '整體填答率']], chart: bars(rows.map(r => ({ label: r.k, value: +pct(r.n, r.t), display: `${pct(r.n, r.t)}%` })), { max: 100 }), cols: ['部門', '已填寫', '已發送', '填答率'], rows: rows.map(r => [r.k, r.n, r.t, pct(r.n, r.t) + '%']) };
    },
  },
};
function asOf(emps) { const ids = new Set(emps.map(e => e.id)); return S.workload.filter(a => ids.has(a.empId)); }
function wlOf(emps) { return asOf(emps).map(evalWorkload); }
function ergoOf(emps) { const ids = new Set(emps.map(e => e.id)); return S.ergo.filter(s => ids.has(s.empId) && s.status === '已填寫'); }
function reportData(kind) {
  const f = fval('rep');
  const cur = UI.f['repType_' + kind] || REPORT_TYPES[kind][0][0];
  const emps = S.employees.filter(e => orgMatch(e, f));
  return { cur, d: REPORTS[kind][cur](emps), title: REPORT_TYPES[kind].find(t => t[0] === cur)[1] };
}
function reportBody(kind) {
  const { cur, d, title } = reportData(kind);
  return `<div class="panel">${filterForm('rep', ORG_FILTERS)}
    <div class="toolbar"><label class="chk">報表類型 ${sel('repType', REPORT_TYPES[kind], cur, `data-change="repType" data-k="${kind}" aria-label="報表類型"`)}</label><span class="sp"></span><button class="btn sm" data-act="exportRep" data-k="${kind}">檔案匯出（Excel）</button></div>
    <div class="pbody"><h2 style="font-size:16px;margin:0 0 12px">${esc(title)}</h2><div class="repgrid"><div><div class="bigsum">${d.sum.map(([v, l]) => `<div><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}</div>${d.chart}</div>
      <div>${tbl(d.cols.map((h, i) => ({ h, cls: i ? 'num' : '', f: r => esc(r[i]) })), d.rows)}</div></div></div></div>`;
}
VIEWS.reports = {
  title: () => '統計分析報表',
  render() {
    const t = curTab('reports', 'health');
    return `<div class="page-head"><div><h1>統計分析報表</h1><p class="sub">依法人、廠區、部門篩選；數字由目前資料即時計算。</p></div></div>
      ${tabs('reports', [['health', '健康管理'], ['wl', '異常工作負荷'], ['ergo', '人因性危害']])}<div style="margin-top:14px">${reportBody(t)}</div>`;
  },
};
ACT.repType = el => { UI.f['repType_' + el.dataset.k] = el.value; render(); };
ACT.exportRep = el => { const { d, title } = reportData(el.dataset.k); exportCsv(title, d.cols.map((h, i) => ({ h, v: r => r[i] })), d.rows); };

/* ====================================================================
   SETTINGS
   ==================================================================== */
function staffRows() {
  const f = fval('staff', { active: '1' });
  const q = (f.kw || '').toLowerCase();
  return S.staff.filter(s => (!f.role || s.role === f.role) && (!f.active || String(+s.active) === f.active) && (!f.site || s.sites.includes(f.site)) && (!q || s.name.includes(f.kw) || s.email.toLowerCase().includes(q)))
    .sort((a, b) => b.active - a.active || STAFF_ROLES.indexOf(a.role) - STAFF_ROLES.indexOf(b.role));
}
VIEWS.staff = {
  title: () => '醫護人員管理',
  render() {
    const rows = staffRows();
    const act = S.staff.filter(s => s.active);
    return `<div class="page-head"><div><h1>醫護人員管理</h1><p class="sub">這裡的人員會出現在指派、協助人員、面談醫師、附表八執行人員與簽核人等選單。停用後不能再被指派，但舊紀錄仍顯示原本的人名。</p></div></div>
    <div class="panel"><div class="pbody"><div class="bigsum" style="margin:0">${STAFF_ROLES.map(r => `<div><b>${act.filter(s => s.role === r).length}</b><span>${r}（啟用）</span></div>`).join('')}<div><b>${S.staff.length - act.length}</b><span>已停用</span></div></div></div></div>
    <div class="panel">${filterForm('staff', [{ k: 'kw', label: '姓名／Email' }, { k: 'role', label: '角色', type: 'select', opts: STAFF_ROLES }, { k: 'site', label: '負責廠區', type: 'select', opts: SITE_OPTS }, { k: 'active', label: '狀態', type: 'select', def: '1', opts: [['1', '啟用'], ['0', '停用']] }])}
      <div class="toolbar"><button class="btn sm primary" data-act="staffEdit">＋ 新增人員</button><span class="sp"></span><span class="muted">共 ${rows.length} 人</span></div>
      ${tbl([
        { h: '姓名', f: s => `<b>${esc(s.name)}</b>${s.id === ME ? ' ' + pill('目前登入', 'acc') : ''}<span class="sub2 mono">${s.id}</span>` },
        { h: '角色', f: s => pill(s.role, CARE_ROLES.includes(s.role) ? 'info' : '') },
        { h: 'Email', f: s => `<span class="mono">${esc(s.email)}</span>` },
        { h: '電話', cls: 'nowrap mono', f: s => esc(s.phone) || '<span class="faint">—</span>' },
        { h: '負責廠區', cls: 'nowrap', f: s => esc(s.sites.map(siteName).join('、')) || '<span class="faint">—</span>' },
        { h: '資格／證照', f: s => s.qual ? `<span style="display:block;min-width:13em">${esc(s.qual)}</span>` : '<span class="faint">—</span>' },
        { h: '主責個案', cls: 'num', f: s => staffLoad(s.id).cases.length },
        { h: '待追蹤', cls: 'num', f: s => staffLoad(s.id).tasks.length },
        { h: '狀態', f: s => pill(s.active ? '啟用' : '停用', s.active ? 'ok' : '') },
        { h: '', f: s => { const l = staffLoad(s.id); return `<div class="acts"><button class="btn sm" data-act="staffEdit" data-id="${s.id}">編輯</button>${l.cases.length + l.tasks.length ? `<button class="btn sm" data-act="staffMove" data-id="${s.id}">轉移工作</button>` : ''}</div>`; } },
      ], rows, { empty: '沒有符合條件的人員' })}</div>`;
  },
};
ACT.staffEdit = el => {
  const s = el.dataset.id ? staff(el.dataset.id) : null;
  const v = s || { name: '', role: '職護', email: '', phone: '', sites: [], qual: '', active: true };
  const l = s ? staffLoad(s.id) : { cases: [], tasks: [] };
  const m = openModal({
    title: s ? `編輯人員 · ${s.name}` : '新增人員',
    body: `<form>${l.cases.length + l.tasks.length ? `<p class="mctx">目前主責 ${l.cases.length} 件個案、${l.tasks.length} 件待追蹤事項。停用或改為非醫護角色前，請先轉移工作。</p>` : ''}
      <div class="fgrid">${fld('姓名', inp('name', v.name), { req: 1 })}${fld('角色', sel('role', STAFF_ROLES, v.role), { req: 1 })}${fld('Email', inp('email', v.email, 'type="email"'), { req: 1 })}${fld('電話', inp('phone', v.phone))}
        ${fld('負責廠區（職護、職醫至少一個）', chks('sites', SITE_OPTS, v.sites), { cls: 'full' })}
        ${fld('資格／證照', inp('qual', v.qual, 'placeholder="例如 勞工健康服務護理人員訓練合格"'), { cls: 'full' })}
        ${fld('狀態', `<div class="chks">${radios('active', [['1', '啟用'], ['0', '停用']], v.active ? '1' : '0')}</div>`)}</div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="staffSave">儲存</button>`,
  });
  m.ctx.id = s?.id;
};
ACT.staffSave = () => {
  const id = topModal().ctx.id;
  const o = formObj(curForm());
  const miss = [!o.name && '姓名', !o.role && '角色', !o.email && 'Email'].filter(Boolean);
  if (miss.length) return toast(`請填寫必填欄位：${miss.join('、')}`, 'warn');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(o.email)) return toast('Email 格式不正確', 'warn');
  if (S.staff.some(x => x.id !== id && x.email.toLowerCase() === o.email.toLowerCase())) return toast(`Email ${o.email} 已被其他人員使用`, 'warn');
  if (CARE_ROLES.includes(o.role) && !o.sites.length) return toast('職護、職醫請至少勾選一個負責廠區', 'warn');
  const active = o.active === '1';
  if (id) {
    if (id === ME && (!active || o.role !== staff(ME).role)) return toast('無法停用或變更目前登入帳號的角色', 'warn');
    const l = staffLoad(id);
    const n = l.cases.length + l.tasks.length;
    if (n && (!active || !CARE_ROLES.includes(o.role))) return toast(`${staffName(id)} 還有 ${l.cases.length} 件個案、${l.tasks.length} 件待追蹤事項，請先用「轉移工作」交給其他人員`, 'warn');
  }
  const patch = { name: o.name, role: o.role, email: o.email, phone: o.phone, sites: o.sites, qual: o.qual, active };
  if (id) Object.assign(staff(id), patch);
  else S.staff.push({ id: 'U' + (Math.max(...S.staff.map(x => +x.id.slice(1))) + 1), ...patch });
  closeModal();
  commit(id ? `已更新 ${o.name}` : `已新增 ${o.name}（${o.role}）`);
};
ACT.staffMove = el => {
  const id = el.dataset.id;
  const l = staffLoad(id);
  const to = staffOpts(CARE_ROLES).filter(([x]) => x !== id);
  const m = openModal({
    title: `轉移工作 · ${staffName(id)}`,
    body: `<form><p class="mctx">${esc(staffName(id))} 目前主責 ${l.cases.length} 件個案、${l.tasks.length} 件待追蹤事項。</p>
      ${l.cases.length ? `<p class="hint" style="margin:0 0 10px">個案：${esc(l.cases.map(x => emp(x).name).join('、'))}</p>` : ''}
      <div class="fgrid">${fld('轉給', sel('to', to), { req: 1 })}${fld('轉移項目', chks('what', [['cases', `主責個案（${l.cases.length}）`], ['tasks', `待追蹤事項（${l.tasks.length}）`]], ['cases', 'tasks']), { cls: 'full' })}
        ${fld('轉移後', `<label class="chk"><input type="checkbox" name="deactivate" ${id === ME ? 'disabled' : ''}><span>同時停用此人員${id === ME ? '（目前登入帳號不可停用）' : ''}</span></label>`, { cls: 'full' })}</div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="staffMoveSave">轉移</button>`,
  });
  m.ctx.id = id;
};
ACT.staffMoveSave = () => {
  const id = topModal().ctx.id;
  const o = formObj(curForm());
  if (!o.to) return toast('請選擇要轉給誰', 'warn');
  if (!o.what.length) return toast('請至少勾選一種轉移項目', 'warn');
  const l = staffLoad(id);
  const nc = o.what.includes('cases') ? l.cases.length : 0;
  const nt = o.what.includes('tasks') ? l.tasks.length : 0;
  if (nc) l.cases.forEach(eid => { S.cases[eid].nurse = o.to; });
  if (nt) l.tasks.forEach(r => { r.follow.staff = o.to; });
  const left = staffLoad(id);
  let msg = `已將 ${nc} 件個案、${nt} 件待追蹤事項轉給 ${staffName(o.to)}`;
  if (o.deactivate && id !== ME) {
    if (left.cases.length + left.tasks.length) msg += `；仍有未轉移的工作，${staffName(id)} 維持啟用`;
    else { staff(id).active = false; msg += `，並停用 ${staffName(id)}`; }
  }
  closeModal();
  commit(msg);
};
VIEWS.rules = {
  title: () => '分級標準',
  render() {
    return `<div class="page-head"><div><h1>分級標準</h1><p class="sub">健檢分級規則依版本管理。修改後，健檢報告分級、個案管理、異常事件與統計報表會立即依新規則重算。</p></div></div>
    <div class="callout warn"><b>待確認：</b>原系統手冊中，舒張壓有兩組切點。分級標準表為 90／100／110 mmHg，健檢明細的提示為 85／90／100 mmHg。雛形採用分級標準表的數值；可按舒張壓的「編輯」套用另一組數值比較差異。</div>
    <div class="panel"><div class="toolbar" style="border-top:0"><label class="chk">版本 <select aria-label="版本" style="width:auto"><option>V1（使用中）</option></select></label><span class="sp"></span><span class="legend"><span>${pill('手冊', 'info')} 取自原系統手冊</span><span>${pill('示意')} 雛形示範值</span></span></div>
    ${tbl([
      { h: '檢項類型', f: () => '一般' }, { h: '檢項代碼', f: r => `<span class="mono">${r.code}</span>` }, { h: '分級檢項名稱', f: r => esc(r.name) }, { h: '性別', f: r => r.sex }, { h: '版本', f: () => '1' },
      { h: '級數', cls: 'num', f: r => r.levels.length }, { h: '說明', f: r => `<div class="evs">${r.levels.map(l => `<span class="evc">${gb(l.lv)} ${esc(levelDesc(r, l))}</span>`).join('')}</div>` },
      { h: '類型', f: r => r.type === 'text' ? '文字' : '數字' }, { h: '單位', f: r => esc(r.unit) }, { h: '來源', f: r => pill(r.src === 'manual' ? '手冊' : '示意', r.src === 'manual' ? 'info' : '') },
      { h: '', f: (r, i) => r.type === 'text' ? '' : `<button class="btn sm" data-act="ruleEdit" data-i="${i}">編輯</button>` },
    ], S.rules)}</div>`;
  },
};
ACT.ruleEdit = el => {
  const i = +el.dataset.i;
  const r = S.rules[i];
  const isDbp = r.code === 'B0112';
  const m = openModal({
    title: `編輯分級規則 · ${r.name}`,
    body: `<form><p class="mctx">${r.code} · ${r.sex} · 單位 ${esc(r.unit)}。下限含（≥），上限不含（<），留空表示不設限。</p>
      ${tbl([{ h: '級數', f: l => gb(l.lv) }, { h: '下限（≥）', f: l => `<input type="number" step="any" name="min[]" value="${l.min ?? ''}" aria-label="第 ${l.lv} 級下限">` }, { h: '上限（<）', f: l => `<input type="number" step="any" name="max[]" value="${l.max ?? ''}" aria-label="第 ${l.lv} 級上限">` }], r.levels, { cls: 'form' })}
      ${isDbp ? '<p><button type="button" class="btn sm" data-act="dbpAlt">套用健檢明細提示值（85／90／100）</button></p>' : ''}</form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="ruleReset">還原為 V1 預設</button></div><button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="ruleSave">儲存並重算</button>`,
  });
  m.ctx.i = i;
};
ACT.dbpAlt = () => {
  const f = curForm();
  const mins = ['', 85, 90, 100], maxs = [85, 90, 100, ''];
  f.querySelectorAll('[name="min[]"]').forEach((x, k) => { x.value = mins[k]; });
  f.querySelectorAll('[name="max[]"]').forEach((x, k) => { x.value = maxs[k]; });
};
ACT.ruleSave = () => {
  const i = topModal().ctx.i;
  const o = formObj(curForm());
  const num = v => v === '' ? undefined : +v;
  const levels = S.rules[i].levels.map((l, k) => { const n = { lv: l.lv }; const a = num(o.min[k]), b = num(o.max[k]); if (a != null) n.min = a; if (b != null) n.max = b; return n; });
  if (levels.some(l => l.min != null && l.max != null && l.min >= l.max)) return toast('每一級的下限必須小於上限', 'warn');
  S.rules[i].levels = levels;
  closeModal(); commit(`已更新「${S.rules[i].name}」，健檢分級與異常事件已重算`);
};
ACT.ruleReset = () => {
  const i = topModal().ctx.i;
  const r = S.rules[i];
  const def = RULES_V1.find(x => x.code === r.code && x.sex === r.sex);
  r.levels = JSON.parse(JSON.stringify(def.levels));
  closeModal(); commit(`已還原「${r.name}」為 V1 預設值`);
};

VIEWS.phrases = {
  title: () => '片語庫',
  render() {
    const cats = [...new Set(S.phrases.map(p => p.cat))];
    const cur = UI.tab.phraseCat && cats.includes(UI.tab.phraseCat) ? UI.tab.phraseCat : cats[0];
    return `<div class="page-head"><div><h1>片語庫</h1><p class="sub">表單右側「片語」面板的內容來源。點表單欄位後再點片語即可帶入。</p></div></div>
    <div class="split"><div class="panel" style="margin-top:0"><div class="phd"><h3>分類</h3></div><div class="replist">${cats.map(c => `<button class="${c === cur ? 'on' : ''}" data-act="pickPhraseCat" data-c="${esc(c)}"><span>${esc(c)}</span><span class="muted mono">${S.phrases.filter(p => p.cat === c).length}</span></button>`).join('')}</div></div>
      <div class="panel" style="margin-top:0"><div class="phd"><h3>${esc(cur)}</h3></div>
        ${tbl([{ h: '片語內容', f: p => esc(p.text) }, { h: '類型', f: p => p.kind ? pill(p.kind === '改善' ? '應增加或改善' : '建議可採行') : '—' }, { h: '', f: p => `<button class="btn sm ghost" data-act="delPhrase" data-id="${p.id}">刪除</button>` }], S.phrases.filter(p => p.cat === cur))}
        <form class="pbody" style="border-top:1px solid var(--line)" id="phraseForm"><div class="fgrid">${fld('分類', `<input name="cat" value="${esc(cur)}" list="phraseCats"><datalist id="phraseCats">${cats.map(c => `<option value="${esc(c)}">`).join('')}</datalist>`)}${fld('片語內容', txt('text', '', 2), { cls: 'full' })}</div>
          <div style="margin-top:10px;display:flex;justify-content:flex-end"><button type="button" class="btn primary" data-act="addPhrase">新增片語</button></div></form></div></div>`;
  },
};
ACT.pickPhraseCat = el => { UI.tab.phraseCat = el.dataset.c; render(); };
ACT.addPhrase = () => {
  const o = formObj($('#phraseForm'));
  if (!o.cat || !o.text) return toast('請填寫分類與片語內容', 'warn');
  S.phrases.push({ id: uid('P'), cat: o.cat, text: o.text });
  UI.tab.phraseCat = o.cat;
  commit('已新增片語');
};
ACT.delPhrase = el => { S.phrases = S.phrases.filter(p => p.id !== el.dataset.id); commit('已刪除片語'); };

VIEWS.org = {
  title: () => '組織代碼',
  render() {
    return `<div class="page-head"><div><h1>組織代碼</h1><p class="sub">法人／公司 → 廠／院區 → 部門。匯入名單與評估表時以代碼對照。</p></div></div>
    <div class="panel"><div class="phd"><h3>法人代碼表</h3></div>${tbl([{ h: '代碼', f: x => `<span class="mono">${x.code}</span>` }, { h: '法人／公司', f: x => esc(x.name) }, { h: '廠區數', cls: 'num', f: x => ORG.sites.filter(s => s.entity === x.id).length }, { h: '員工數', cls: 'num', f: x => S.employees.filter(e => e.entity === x.id).length }], ORG.entities)}</div>
    <div class="panel"><div class="phd"><h3>廠區代碼表</h3></div>${tbl([{ h: '代碼', f: x => `<span class="mono">${x.code}</span>` }, { h: '廠／院區', f: x => esc(x.name) }, { h: '法人', f: x => esc(entName(x.entity)) }, { h: '地址', f: x => esc(x.address) }], ORG.sites)}</div>
    <div class="panel"><div class="phd"><h3>部門</h3></div>${tbl([{ h: '代碼', f: x => `<span class="mono">${x.id}</span>` }, { h: '部門', f: x => esc(x.name) }, { h: '廠區', f: x => esc(siteName(x.site)) }, { h: '主管', f: x => esc(x.mgr) }, { h: '主管 Email', f: x => `<span class="mono">${esc(x.mgrEmail)}</span>` }, { h: '員工數', cls: 'num', f: x => S.employees.filter(e => e.dept === x.id).length }], ORG.depts)}</div>`;
  },
};

/* ====================================================================
   EMPLOYEE PORTAL (員工端預覽)
   ==================================================================== */
function portalItems(eid) {
  const items = [];
  for (const s of S.ergo.filter(x => x.empId === eid)) items.push({ key: 'nmq:' + s.id, label: '肌肉骨骼症狀調查表', date: s.sentAt, done: s.status === '已填寫' });
  for (const a of S.workload.filter(x => x.empId === eid)) items.push({ key: 'wl:' + a.id, label: '過勞量表與過負荷評估', date: a.sentAt, done: a.pf != null && a.m1 != null });
  for (const m of S.matCases.filter(x => x.empId === eid && x.emailAt)) items.push({ key: 'mat:' + m.id, label: '母性健康保護面談紀錄確認', date: m.emailAt, done: m.status === '已確認' });
  return items.sort((a, b) => a.done - b.done || b.date.localeCompare(a.date));
}
VIEWS.portal = {
  title: () => '員工端預覽',
  render() {
    const withItems = S.employees.filter(e => portalItems(e.id).length);
    const eid = UI.portal.emp && emp(UI.portal.emp) ? UI.portal.emp : empId(29);
    const e = emp(eid);
    const items = portalItems(eid);
    const cur = items.find(i => i.key === UI.portal.item) || items.find(i => !i.done) || items[0];
    return `<div class="page-head"><div><h1>員工端預覽</h1><p class="sub">模擬員工從 Email 連結開啟的畫面。送出後會即時回寫到職護端的清單與個案。</p></div></div>
    <div class="portal"><div class="panel" style="margin-top:0"><div class="pbody">${fld('以哪位員工的身分預覽', sel('pemp', withItems.map(x => [x.id, `${x.name}（${x.id}）${portalItems(x.id).some(i => !i.done) ? ' · 有待辦' : ''}`]), eid, 'data-change="portalEmp"'))}</div>
      <div class="phd" style="border-top:1px solid var(--line)"><h3>${esc(e.name)} 收到的連結</h3></div>
      <div class="inbox">${items.map(i => `<button class="${i === cur ? 'on' : ''}" data-act="portalItem" data-k="${i.key}"><span>${esc(i.label)}</span>${pill(i.done ? '已完成' : '待填寫', i.done ? 'ok' : 'warn')}<small>寄送日期 ${fmtD(i.date)}</small></button>`).join('') || '<div class="empty">沒有收到問卷或確認單</div>'}</div></div>
      <div class="phone" aria-label="員工手機畫面"><div class="bar0"></div><div class="scr">${cur ? portalScreen(e, cur) : '<p class="muted">沒有內容</p>'}</div></div></div>`;
  },
};
ACT.portalEmp = el => { UI.portal = { emp: el.value }; render(); };
ACT.portalItem = el => { UI.portal.item = el.dataset.k; UI.portal.lang = null; render(); };
ACT.portalLang = el => { UI.portal.lang = el.value; render(); };
function portalScreen(e, it) {
  const [kind, id] = it.key.split(':');
  if (kind === 'nmq') {
    const s = S.ergo.find(x => x.id === id);
    const lang = UI.portal.lang || s.lang || e.lang;
    const T = I18N[lang];
    if (s.status === '已填寫' && !UI.portal.edit) return `<h2>${esc(T.title)}</h2><div class="pcard"><p style="margin:0">${esc(T.done)}</p><p class="hint">${fmtD(s.filledAt)}</p></div><div class="pcard">${nmqBars(s, lang)}</div><button class="btn sm" data-act="portalEdit" style="margin-top:10px">修改</button>`;
    return `<div style="display:flex;justify-content:space-between;gap:8px;align-items:center"><h2>${esc(T.title)}</h2>${sel('plang', LANGS, lang, 'data-change="portalLang" aria-label="語系" style="width:auto"')}</div>
      <div class="pcard"><h3>${esc(T.personal)}</h3><div style="font-size:13px;line-height:1.7">${esc(T.empNo)}：${e.empNo}<br>${esc(T.name)}：${esc(e.name)}<br>${esc(T.site)}：${esc(siteName(e.site))}<br>${esc(T.dept)}：${esc(deptName(e.dept))}<br>${esc(T.page)}</div></div>
      <form id="pform" class="pcard">${nmqFields(lang, s, true)}<button class="btn primary" style="width:100%;margin-top:14px" data-act="portalNmq" data-id="${s.id}">${esc(T.submit)}</button></form>`;
  }
  if (kind === 'wl') {
    const a = S.workload.find(x => x.id === id);
    if (a.pf != null && a.m1 != null && !UI.portal.edit) return `<h2>過勞量表與過負荷評估</h2><div class="pcard"><p style="margin:0">已送出，謝謝您的填寫。</p><p class="hint">過勞量表 ${fmtD(a.fatigueAt)}；過負荷評估 ${fmtD(a.overloadAt)}</p></div><button class="btn sm" data-act="portalEdit" style="margin-top:10px">修改</button>`;
    const q = (txtQ, name, opts) => `<div style="margin-top:12px"><div style="font-size:13.5px;font-weight:500;margin-bottom:6px">${esc(txtQ)}</div><div class="chks col">${radios(name, opts.map((o, i) => [String(i), o]), '')}</div></div>`;
    return `<h2>過勞量表與過負荷評估</h2><p class="hint" style="margin-top:0">此問卷於雛形僅提供中文。</p><form id="pform">
      <div class="pcard"><h3>一、個人相關過勞</h3>${CBI.personal.map((x, i) => q(x, 'p' + i, CBI.freq)).join('')}</div>
      <div class="pcard"><h3>二、工作相關過勞</h3>${CBI.work.map((x, i) => q(x.q, 'w' + i, CBI[x.s])).join('')}</div>
      <div class="pcard"><h3>三、加班與工作型態</h3><div class="fgrid">${fld('近 1 個月加班時數', `<input type="number" name="m1" min="0" value="${a.m1 ?? ''}">`)}${fld('近 2–6 個月平均加班時數', `<input type="number" name="avg6" min="0" value="${a.avg6 ?? ''}">`)}</div><div style="margin-top:10px">${chks('patterns', WORK_PATTERNS, a.patterns, 'col')}</div></div>
      <button class="btn primary" style="width:100%;margin-top:14px" data-act="portalWl" data-id="${a.id}">送出</button></form>`;
  }
  const c = S.matCases.find(x => x.id === id);
  const iv = c.interview || {};
  if (c.status === '已確認') return `<h2>母性健康保護面談紀錄確認</h2><div class="pcard"><p style="margin:0">您已於 ${fmtD(c.confirmAt)} 完成確認。</p><p class="hint">同意接受：${esc(c.agreed.join('、'))}</p></div>`;
  return `<h2>母性健康保護面談紀錄確認</h2><form id="pform">
    <div class="pcard"><h3>三、工作環境危害及健康問題</h3><div style="font-size:13px;line-height:1.8">1. 工作環境危害（參閱附表一）：<b>${esc(iv.envLevel || '—')}</b><br>2. 健康問題：<b>${esc(iv.health || '—')}</b></div></div>
    <div class="pcard"><h3>四、採取措施</h3><div style="font-size:13px;line-height:1.8">${esc((iv.measures || []).join('、') || '—')}<br>衛教指導：${esc(iv.edu || '—')}</div></div>
    ${c.fit ? `<div class="pcard"><h3>工作適性安排建議</h3><div style="font-size:13px;line-height:1.8">${esc(c.fit.advice)}${c.fit.limits.length ? `：${esc(c.fit.limits.join('、'))}` : ''}<br>${esc(c.fit.note)}</div></div>` : ''}
    <div class="pcard"><p style="margin:0 0 10px;font-size:13.5px">本人 ${esc(emp(c.empId).name)} 已於 ${fmtD(iv.date)} 與 ${esc(staffName(iv.by))} 面談，並已清楚所處作業環境對健康之影響，及公司所採取之措施，本人同意接受下述之建議：</p>${chks('agree', MAT_AGREE, iv.proposed || [], 'col')}</div>
    <button class="btn primary" style="width:100%;margin-top:14px" data-act="portalMatOk" data-id="${c.id}">確認</button></form>`;
}
ACT.portalEdit = () => { UI.portal.edit = true; render(); };
ACT.portalNmq = el => {
  const s = S.ergo.find(x => x.id === el.dataset.id);
  const o = formObj($('#pform'));
  const lang = UI.portal.lang || s.lang;
  if (!o.injury || !o.any) return toast(I18N[lang].need, 'warn');
  Object.assign(s, readNmq(o), { status: '已填寫', filledAt: TODAY, filledBy: 'self', lang });
  UI.portal.edit = false;
  const m = nmqMax(s);
  commit(`員工已送出問卷（${LANGS.find(l => l[0] === lang)[1]}）。職護端判定：${nmqHazardLabel(s)}${m >= 3 ? '，已產生人因性危害異常事件' : ''}`);
};
ACT.portalWl = el => {
  const a = S.workload.find(x => x.id === el.dataset.id);
  const o = formObj($('#pform'));
  const ans = readCbi(o);
  if ([...ans.p, ...ans.w].some(x => x < 0)) return toast('請完成過勞量表全部 13 題', 'warn');
  if (o.m1 === '' || o.avg6 === '') return toast('請填寫加班時數', 'warn');
  Object.assign(a, cbiScores(ans), { cbi: ans, fatigueAt: TODAY, cbiBy: 'self', m1: +o.m1, avg6: +o.avg6, patterns: o.patterns, overloadAt: TODAY, olBy: 'self' });
  UI.portal.edit = false;
  const w = evalWorkload(a);
  commit(`員工已送出。職護端判定：${w.complete ? `${RISK_LABEL[w.riskLevel]}，${w.advice}` : '缺少健檢資料，無法判定'}`);
};
ACT.portalMatOk = el => {
  const c = S.matCases.find(x => x.id === el.dataset.id);
  const o = formObj($('#pform'));
  if (!o.agree.length) return toast('請至少勾選一項同意接受的建議', 'warn');
  Object.assign(c, { status: '已確認', confirmAt: `${TODAY} ${nowHM()}`, agreed: o.agree });
  commit('員工已確認面談紀錄，職護端狀態已更新為「已確認」');
};

/* ---------- boot ---------- */
render();
