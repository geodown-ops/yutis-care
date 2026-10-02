'use strict';
/* Yutis Care prototype: core shell, shared UI helpers, home, employees, profile, assist records. */

/* ---------- utilities ---------- */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtD = s => s ? String(s).slice(0, 10).replaceAll('-', '/') + (String(s).length > 10 ? String(s).slice(10) : '') : '';
const WD = ['日', '一', '二', '三', '四', '五', '六'];
const fmtLong = d => `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())}（${WD[d.getDay()]}）`;
const uid = p => p + Date.now().toString(36).slice(-4) + Math.random().toString(36).slice(2, 5);
const nowHM = () => { const d = new Date(); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const SITE_OPTS = ORG.sites.map(s => [s.id, s.name]);
const DEPT_OPTS = ORG.depts.map(d => [d.id, `${siteName(d.site)}／${d.name}`]);

/* ---------- state ---------- */
function loadState() {
  try {
    const t = localStorage.getItem(STORE_KEY);
    if (!t) return null;
    const o = JSON.parse(t);
    if (o && o.ver === 1) { o.staff = JSON.parse(JSON.stringify(STAFF_SEED)); o.ver = 2; } // v1 kept staff in code
    return o && o.ver === APP_VER ? o : null;
  } catch (e) { return null; }
}
function persist() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: keep in memory */ } }
let S = loadState();
if (!S) { S = seedState(); initEventStatus(); persist(); }

const UI = { route: { name: 'home', p: {} }, tab: {}, f: {}, sel: new Set(), cal: null, calMode: 'all', navOpen: false, lastField: null, portal: {} };
const VIEWS = {};
const ACT = {};

/* ---------- html helpers ---------- */
const pill = (t, k = '') => `<span class="pill ${k}">${esc(t)}</span>`;
const gb = lv => lv ? `<span class="gb g${lv}">${lv}</span>` : '<span class="faint">—</span>';
const ST_PILL = { '未開單': 'bad', '起單': 'info', '處理中': 'warn', '結案': 'ok' };
const stPill = s => pill(s, ST_PILL[s] || '');
const riskPill = lv => lv == null ? '<span class="faint">—</span>' : pill(`${lv}：${RISK_LABEL[lv]}`, ['ok', 'warn', 'bad'][lv]);
const loadPill = lv => lv == null ? '<span class="faint">—</span>' : pill(`${lv}：${LOAD_LABEL[lv]}`, ['ok', 'warn', 'bad'][lv]);
const nameBtn = e => `<button class="namebtn" data-act="go" data-to="profile" data-id="${e.id}">${esc(e.name)}</button>`;
const empCell = e => `${nameBtn(e)}<span class="sub2">${e.id} · ${esc(siteName(e.site))}／${esc(deptName(e.dept))}</span>`;
function evChips(evs) {
  if (!evs || !evs.length) return '<span class="faint">—</span>';
  return `<div class="evs">${evs.map(x => `<span class="evc" title="${esc(x.desc + '｜' + x.status)}"><i class="st${stIdx(x.status)}"></i>${esc(EV[x.type].s)}</span>`).join('')}</div>`;
}
function fld(label, inner, o = {}) {
  return `<label class="fld ${o.cls || ''}"><span class="lbl">${o.req ? '<b class="req">*</b>' : ''}${esc(label)}</span>${inner}</label>`;
}
const inp = (name, val = '', attrs = '') => `<input name="${name}" value="${esc(val)}" ${attrs}>`;
const dateInp = (name, val = '') => `<input type="date" name="${name}" value="${esc(val)}">`;
const txt = (name, val = '', rows = 3, attrs = '') => `<textarea name="${name}" rows="${rows}" ${attrs}>${esc(val)}</textarea>`;
function sel(name, opts, val = '', attrs = '') {
  return `<select name="${name}" ${attrs}>${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<option value="${esc(v)}" ${String(v) === String(val ?? '') ? 'selected' : ''}>${esc(l)}</option>`; }).join('')}</select>`;
}
function chks(name, opts, vals = [], cls = '') {
  return `<div class="chks ${cls}">${opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label class="chk"><input type="checkbox" name="${name}[]" value="${esc(v)}" ${(vals || []).includes(v) ? 'checked' : ''}><span>${esc(l)}</span></label>`; }).join('')}</div>`;
}
function radios(name, opts, val, attrs = '') {
  return opts.map(o => { const [v, l] = Array.isArray(o) ? o : [o, o]; return `<label class="chk"><input type="radio" name="${name}" value="${esc(v)}" ${String(v) === String(val ?? '') ? 'checked' : ''} ${attrs}><span>${esc(l)}</span></label>`; }).join('');
}
function tbl(cols, rows, o = {}) {
  if (!rows.length) return `<div class="empty">${o.empty || '沒有符合條件的資料'}</div>`;
  return `<div class="tbl-wrap"><table class="tbl ${o.cls || ''}"><thead><tr>${cols.map(c => `<th class="${c.cls || ''}">${c.h}</th>`).join('')}</tr></thead><tbody>${rows.map((r, i) => `<tr>${cols.map(c => `<td class="${c.cls || ''}">${c.f(r, i)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}
function tabs(key, list) {
  const cur = UI.tab[key] || list[0][0];
  return `<div class="tabs" role="tablist">${list.map(([k, l]) => `<button role="tab" class="tab ${k === cur ? 'on' : ''}" aria-selected="${k === cur}" data-act="tab" data-k="${key}" data-v="${k}">${esc(l)}</button>`).join('')}</div>`;
}
const curTab = (key, def) => UI.tab[key] || def;
function filterForm(key, fields, extra = '') {
  const f = UI.f[key] || {};
  return `<form class="filters" data-filter="${key}">${fields.map(x => {
    if (x.type === 'date2') return fld(x.label, `<div class="range"><input type="date" name="${x.k}From" value="${esc(f[x.k + 'From'] || '')}" aria-label="${esc(x.label)}起"><span>～</span><input type="date" name="${x.k}To" value="${esc(f[x.k + 'To'] || '')}" aria-label="${esc(x.label)}迄"></div>`);
    if (x.type === 'select') return fld(x.label, sel(x.k, x.noAll ? x.opts : [['', '全部'], ...x.opts], f[x.k] ?? (x.def ?? '')));
    if (x.type === 'checks') return fld(x.label, chks(x.k, x.opts, f[x.k] || []));
    return fld(x.label, `<input name="${x.k}" value="${esc(f[x.k] || '')}" placeholder="${esc(x.ph || '')}">`);
  }).join('')}<div class="factions">${extra}<button type="button" class="btn ghost" data-act="clearFilter" data-k="${key}">清除</button><button class="btn primary" type="submit">查詢</button></div></form>`;
}
const fval = (key, defs = {}) => ({ ...defs, ...(UI.f[key] || {}) });
const inRange = (d, f, k) => (!f[k + 'From'] || (d && d >= f[k + 'From'])) && (!f[k + 'To'] || (d && d <= f[k + 'To']));
const kwMatch = (e, q) => !q || e.name.includes(q) || e.id.toLowerCase().includes(q.toLowerCase()) || e.empNo.toLowerCase().includes(q.toLowerCase());
const orgMatch = (e, f) => (!f.site || e.site === f.site) && (!f.dept || e.dept === f.dept);
const ORG_FILTERS = [{ k: 'site', label: '廠／院區', type: 'select', opts: SITE_OPTS }, { k: 'dept', label: '部門', type: 'select', opts: DEPT_OPTS }];
const KW_FILTER = { k: 'kw', label: '員工帳號／姓名', ph: '例如 YC0002 或 林志豪' };
const selHead = `<input type="checkbox" data-change="selAll" aria-label="全選">`;
const selCell = (id, label) => `<input type="checkbox" data-change="selRow" value="${id}" ${UI.sel.has(id) ? 'checked' : ''} aria-label="選取 ${esc(label)}">`;
function bars(rows, o = {}) {
  const max = o.max ?? Math.max(1, ...rows.map(r => r.value));
  return `<div class="bars">${rows.map(r => `<div class="bar"><span class="bl" title="${esc(r.label)}">${esc(r.label)}</span><div class="tr"><div class="fi" style="width:${(r.value / max * 100).toFixed(1)}%;${r.color ? `background:var(--${r.color})` : ''}"></div></div><span class="bv">${esc(r.display ?? r.value)}</span></div>`).join('')}</div>`;
}
function stackBar(parts) {
  const tot = parts.reduce((s, p) => s + p.value, 0) || 1;
  return `<div class="stack" role="img" aria-label="${esc(parts.map(p => `${p.label} ${p.value}`).join('，'))}">${parts.filter(p => p.value).map(p => `<div style="width:${(p.value / tot * 100).toFixed(2)}%;background:var(--${p.color})" title="${esc(p.label)}：${p.value}">${p.value / tot >= 0.07 ? p.value : ''}</div>`).join('')}</div>
  <div class="legend" style="margin-top:8px">${parts.map(p => `<span><i class="dot" style="background:var(--${p.color})"></i>${esc(p.label)} ${p.value}（${(p.value / tot * 100).toFixed(1)}%）</span>`).join('')}</div>`;
}

/* ---------- modal, toast, confirm, export ---------- */
const MODALS = [];
const topModal = () => MODALS[MODALS.length - 1];
const curForm = () => topModal()?.querySelector('form');
function openModal({ title, body, foot = '', size = '', side = '' }) {
  const el = document.createElement('div');
  el.className = 'mb';
  const id = 'mdl' + MODALS.length;
  el.innerHTML = `<div class="modal ${size}" role="dialog" aria-modal="true" aria-labelledby="${id}"><div class="mh"><h2 id="${id}">${esc(title)}</h2><button class="icon-btn" data-act="closeModal" aria-label="關閉">×</button></div><div class="mbody"><div class="mmain">${body}</div>${side ? `<aside class="mside">${side}</aside>` : ''}</div>${foot ? `<div class="mf">${foot}</div>` : ''}</div>`;
  $('#modal-root').appendChild(el);
  MODALS.push(el);
  document.body.classList.add('modal-open');
  setTimeout(() => el.querySelector('.mmain input:not([readonly]):not([type=checkbox]):not([type=radio]), .mmain select, .mmain textarea')?.focus({ preventScroll: true }), 40);
  el.ctx = {};
  return el;
}
function closeModal() {
  MODALS.pop()?.remove();
  if (!MODALS.length) document.body.classList.remove('modal-open');
}
function toast(msg, kind = 'ok') {
  const t = document.createElement('div');
  t.className = 'toast ' + kind;
  t.textContent = msg;
  $('#toast-root').appendChild(t);
  setTimeout(() => t.classList.add('out'), 3000);
  setTimeout(() => t.remove(), 3400);
}
function confirmBox(msg, onYes, yes = '確定') {
  const el = openModal({ title: '請確認', body: `<p style="margin:0">${esc(msg)}</p>`, size: 'sm', foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn danger" data-act="confirmYes">${esc(yes)}</button>` });
  el.ctx.onYes = onYes;
}
function exportCsv(title, cols, rows) {
  const cell = x => { const s = String(x ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const csv = [cols.map(c => c.h), ...rows.map(r => cols.map(c => c.v(r)))].map(l => l.map(cell).join(',')).join('\n');
  openModal({ title: `匯出：${title}`, size: 'lg', body: `<p class="hint" style="margin:0 0 8px">雛形以 CSV 文字呈現，複製後可直接貼到 Excel。共 ${rows.length} 筆。</p><textarea class="csv" readonly rows="16" aria-label="CSV 內容">${esc(csv)}</textarea>`, foot: `<button class="btn ghost" data-act="closeModal">關閉</button><button class="btn primary" data-act="copyCsv">複製</button>` });
}
function protoOnly(what) { toast(`${what}：雛形尚未實作，正式版提供`, 'info'); }
function commit(msg, kind) { persist(); render(); if (msg) toast(msg, kind); }

/* ---------- form reading ---------- */
function formObj(f) {
  const o = {};
  for (const el of f.elements) {
    const n = el.name;
    if (!n || el.type === 'file') continue;
    const arr = n.endsWith('[]');
    const k = arr ? n.slice(0, -2) : n;
    if (arr && !(k in o)) o[k] = [];
    if (el.type === 'checkbox') { if (arr) { if (el.checked) o[k].push(el.value); } else o[k] = el.checked; }
    else if (el.type === 'radio') { if (!(k in o)) o[k] = ''; if (el.checked) o[k] = el.value; }
    else if (arr) o[k].push(el.value.trim());
    else o[k] = el.value.trim();
  }
  return o;
}

/* ---------- navigation ---------- */
const NAV = [
  ['工作台', [['home', '職護首頁']]],
  ['員工', [['employees', '員工資料'], ['cases', '個案管理']]],
  ['職業衛生計畫', [['ergo', '人因性危害'], ['workload', '異常工作負荷'], ['maternal', '母性健康保護'], ['violence', '不法侵害預防'], ['service', '勞工健康服務']]],
  ['分析', [['reports', '統計分析報表']]],
  ['設定', [['staff', '醫護人員管理'], ['rules', '分級標準'], ['phrases', '片語庫'], ['org', '組織代碼']]],
  ['員工端預覽', [['portal', '問卷與確認']]],
];
function navHtml() {
  const active = UI.route.name === 'profile' ? 'employees' : UI.route.name;
  const unopened = allEvents().filter(e => e.status === '未開單').length;
  return NAV.map(([g, items]) => `<div class="ng"><span>${g}</span>${items.map(([k, l]) => `<button class="ni ${k === active ? 'on' : ''}" data-act="go" data-to="${k}" ${k === active ? 'aria-current="page"' : ''}>${l}${k === 'home' && unopened ? `<span class="cnt" title="異常事件未開單">${unopened}</span>` : ''}</button>`).join('')}</div>`).join('');
}
function go(name, p = {}) {
  UI.route = { name, p };
  UI.navOpen = false;
  UI.sel.clear();
  render();
  window.scrollTo(0, 0);
}
function render() {
  const v = VIEWS[UI.route.name] || VIEWS.home;
  $('#nav').innerHTML = navHtml();
  $('#crumb').textContent = v.title(UI.route.p);
  document.title = 'Yutis Care';
  const me = staff(ME);
  $('.me').innerHTML = `<i aria-hidden="true">${esc(me.name.slice(0, 1))}</i>${esc(me.name)} <span>${esc(me.role)}</span>`;
  $('#page').innerHTML = v.render(UI.route.p);
  document.body.classList.toggle('nav-open', UI.navOpen);
}

/* ---------- global listeners ---------- */
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  fn(el, e);
});
document.addEventListener('change', e => {
  const el = e.target.closest('[data-change]');
  if (el) ACT[el.dataset.change]?.(el, e);
});
document.addEventListener('submit', e => {
  const f = e.target;
  e.preventDefault();
  if (f.id === 'gsearch') return globalSearch(f.q.value.trim());
  if (f.dataset.filter) { UI.f[f.dataset.filter] = formObj(f); UI.sel.clear(); render(); }
});
document.addEventListener('focusin', e => {
  if (e.target.matches('.modal textarea, .modal input:not([type]), .modal input[type=text]')) UI.lastField = e.target;
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && MODALS.length) closeModal(); });

ACT.go = el => {
  if (el.dataset.tabk) UI.tab[el.dataset.tabk] = el.dataset.tab;
  if (MODALS.length) while (MODALS.length) closeModal();
  go(el.dataset.to, el.dataset.id ? { id: el.dataset.id } : {});
};
ACT.tab = el => { UI.tab[el.dataset.k] = el.dataset.v; UI.sel.clear(); render(); };
ACT.clearFilter = el => { UI.f[el.dataset.k] = {}; render(); };
ACT.toggleNav = () => { UI.navOpen = !UI.navOpen; document.body.classList.toggle('nav-open', UI.navOpen); };
ACT.closeNav = () => { UI.navOpen = false; document.body.classList.remove('nav-open'); };
ACT.closeModal = () => closeModal();
ACT.confirmYes = () => { const f = topModal().ctx.onYes; closeModal(); f(); };
ACT.copyCsv = () => {
  const ta = topModal().querySelector('textarea.csv');
  const fallback = () => { ta.focus(); ta.select(); toast('已選取全部內容，請按 Ctrl+C 複製', 'info'); };
  if (!navigator.clipboard) return fallback();
  navigator.clipboard.writeText(ta.value).then(() => toast('已複製到剪貼簿'), fallback);
};
ACT.proto = el => protoOnly(el.dataset.what || '此功能');
ACT.selRow = el => { el.checked ? UI.sel.add(el.value) : UI.sel.delete(el.value); updSel(); };
ACT.selAll = el => { $$('#page [data-change=selRow]').forEach(c => { c.checked = el.checked; el.checked ? UI.sel.add(c.value) : UI.sel.delete(c.value); }); updSel(); };
function updSel() { $$('.selcount').forEach(x => { x.textContent = UI.sel.size; }); }
ACT.resetDemo = () => confirmBox('重置後，您在雛形中新增或修改的資料都會清除，並回到預設示範資料。', () => {
  S = seedState(); initEventStatus(); persist();
  UI.tab = {}; UI.f = {}; UI.cal = null; UI.portal = {};
  go('home'); toast('已重置示範資料');
}, '重置');

function globalSearch(q) {
  if (!q) return;
  const hits = S.employees.filter(e => kwMatch(e, q));
  $('#gq').value = '';
  if (hits.length === 1) return go('profile', { id: hits[0].id });
  if (!hits.length) return toast(`找不到「${q}」，請確認帳號或姓名`, 'warn');
  UI.f.emp = { kw: q };
  go('employees');
  toast(`找到 ${hits.length} 位符合「${q}」的員工`, 'info');
}

/* ====================================================================
   HOME
   ==================================================================== */
function homeKpis() {
  const ev = allEvents();
  const tasks = tasksOpen();
  const pendingSign = [...S.svc, ...S.matEnv, ...S.vioReview].reduce((n, r) => n + (r.signers || []).filter(s => s.sentFirst && !s.confirmed).length, 0) + S.matCases.filter(m => m.status === '待員工確認').length;
  return {
    unopened: ev.filter(e => e.status === '未開單').length,
    due: tasks.filter(t => t.follow.date <= dIso(7)).length,
    overdue: tasks.filter(t => t.follow.date < TODAY).length,
    drafts: S.records.filter(r => r.draft).length,
    sign: pendingSign,
    unfilled: S.ergo.filter(s => s.status === '未填寫').length + S.workload.filter(a => a.pf == null || a.m1 == null).length,
  };
}
function kpi(label, n, color, to, tabk, tab, note = '') {
  return `<button class="kpi" data-act="go" data-to="${to}" ${tabk ? `data-tabk="${tabk}" data-tab="${tab}"` : ''}><span class="kl"><i class="sq" style="background:var(--${color})"></i>${esc(label)}</span><b>${n}</b><small>${esc(note)}</small></button>`;
}
VIEWS.home = {
  title: () => '職護首頁',
  render() {
    const k = homeKpis();
    const t = curTab('home', 'track');
    const panel = { cal: homeCal, track: homeTrack, tasks: homeTasks, drafts: homeDrafts }[t]();
    return `<div class="page-head"><div><h1>職護首頁</h1><p class="sub">${esc(staffName(ME))}（${esc(staff(ME).role)}）· ${fmtLong(D0)} · 負責${esc(staff(ME).sites.map(siteName).join('、'))}</p></div>
      <div class="acts"><button class="btn" data-act="go" data-to="cases">個案管理</button><button class="btn primary" data-act="go" data-to="employees">查詢員工</button></div></div>
      <div class="kpis">
        ${kpi('異常事件未開單', k.unopened, 'bad', 'home', 'home', 'track', '健檢、人因、負荷、母性等規則判定')}
        ${kpi('7 日內待追蹤', k.due, k.overdue ? 'warn' : 'info', 'home', 'home', 'tasks', k.overdue ? `其中 ${k.overdue} 件已逾期` : '無逾期')}
        ${kpi('未完成暫存工作', k.drafts, 'muted', 'home', 'home', 'drafts', '暫存的協助紀錄')}
        ${kpi('待簽核／待確認', k.sign, 'info', 'service', '', '', '附表八、母性、不法侵害')}
        ${kpi('問卷未填寫', k.unfilled, 'faint', 'ergo', '', '', 'NMQ、過勞量表、過負荷評估')}
      </div>
      ${tabs('home', [['cal', '行事曆'], ['track', '異常追蹤'], ['tasks', '待追蹤事項'], ['drafts', '未完成暫存工作']])}
      ${panel}`;
  },
};

function calItems(mode) {
  const m = {};
  const add = (d, x) => (m[d] ||= []).push(x);
  if (mode === 'all' || mode === 'task') for (const r of tasksOpen()) add(r.follow.date, { cls: r.follow.date < TODAY ? 'late' : 'task', label: `${r.follow.time || ''} ${r.follow.cat}（${emp(r.empId).name}）`, act: `data-act="doTask" data-id="${r.id}"` });
  if (mode === 'all' || mode === 'draft') for (const r of S.records.filter(x => x.draft)) add(r.date, { cls: 'draft', label: `暫存｜${r.cat}（${emp(r.empId).name}）`, act: `data-act="editRecord" data-id="${r.id}"` });
  if (mode === 'all' || mode === 'iv') for (const [id, c] of Object.entries(S.cases)) if (c.plannedDate && c.status !== '結案') add(c.plannedDate, { cls: 'iv', label: `[面談] 健康面談（${emp(id).name}）`, act: `data-act="go" data-to="profile" data-id="${id}"` });
  return m;
}
function homeCal() {
  const c = UI.cal || (UI.cal = { y: D0.getFullYear(), m: D0.getMonth() });
  const first = new Date(c.y, c.m, 1);
  const start = addDays(first, -first.getDay());
  const weeks = Math.ceil((first.getDay() + new Date(c.y, c.m + 1, 0).getDate()) / 7);
  const items = calItems(UI.calMode);
  let cells = WD.map(w => `<div class="dow">週${w}</div>`).join('');
  for (let i = 0; i < weeks * 7; i++) {
    const d = addDays(start, i);
    const k = iso(d);
    const its = items[k] || [];
    cells += `<div class="day ${d.getMonth() !== c.m ? 'out' : ''} ${k === TODAY ? 'today' : ''} ${its.length ? '' : 'none'}"><span class="dn">${d.getDate()}<em>${d.getMonth() + 1} 月 ${d.getDate()} 日（${WD[d.getDay()]}）</em></span>
      ${its.slice(0, 4).map(x => `<button class="ce ${x.cls}" ${x.act} title="${esc(x.label)}">${esc(x.label)}</button>`).join('')}${its.length > 4 ? `<span class="faint" style="font-size:12px">+${its.length - 4} 更多</span>` : ''}</div>`;
  }
  const anyThisMonth = Object.keys(items).some(k => k.startsWith(`${c.y}-${pad(c.m + 1)}`));
  return `<div class="calbar"><div class="calnav"><button class="btn sm" data-act="calMove" data-d="-1" aria-label="上個月">‹</button><h3>${c.y} / ${pad(c.m + 1)}</h3><button class="btn sm" data-act="calMove" data-d="1" aria-label="下個月">›</button><button class="btn sm ghost" data-act="calMove" data-d="0">本月</button></div>
    <div class="chks">${radios('calMode', [['all', '全部'], ['task', '待追蹤事項'], ['draft', '未完成暫存工作'], ['iv', '預定面談']], UI.calMode, 'data-change="calMode"')}</div></div>
    <div class="cal">${cells}</div>${anyThisMonth ? '' : '<p class="hint">本月沒有排定的項目。</p>'}
    <div class="legend" style="margin-top:10px"><span><i class="dot" style="background:var(--info)"></i>待追蹤事項</span><span><i class="dot" style="background:var(--bad)"></i>已逾期</span><span><i class="dot" style="background:var(--warn)"></i>未完成暫存</span><span><i class="dot" style="background:var(--accent)"></i>預定面談</span></div>`;
}
ACT.calMove = el => {
  const d = +el.dataset.d;
  if (!d) UI.cal = { y: D0.getFullYear(), m: D0.getMonth() };
  else { const x = new Date(UI.cal.y, UI.cal.m + d, 1); UI.cal = { y: x.getFullYear(), m: x.getMonth() }; }
  render();
};
ACT.calMode = el => { UI.calMode = el.value; render(); };

function trackRows() {
  const f = fval('track', { status: 'open' });
  const byEmp = eventsByEmp();
  return Object.entries(byEmp).map(([id, evs]) => ({ e: emp(id), evs, c: S.cases[id], st: caseStatus(id, evs), last: evs.map(x => x.date).sort().pop() }))
    .filter(r => orgMatch(r.e, f) && kwMatch(r.e, f.kw) && inRange(r.last, f, 'd')
      && (!f.status || (f.status === 'open' ? r.st !== '結案' : r.st === f.status))
      && (!f.assign || (f.assign === '已指派') === !!(r.c && r.c.status !== '結案'))
      && (!f.notice || (f.notice === '已通知') === !!(r.c && r.c.noticeDate && r.c.status !== '結案'))
      && (!f.nurse || !!(r.c && r.c.status !== '結案' && r.c.nurse === f.nurse)))
    .sort((a, b) => stIdx(a.st) - stIdx(b.st) || b.last.localeCompare(a.last));
}
function homeTrack() {
  const rows = trackRows();
  const allCare = S.staff.filter(s => CARE_ROLES.includes(s.role)).map(s => s.id);
  return `<div class="panel">${filterForm('track', [{ k: 'd', label: '通報日期', type: 'date2' }, ORG_FILTERS[0], { k: 'status', label: '個案狀態', type: 'select', def: 'open', opts: [['open', '未結案'], ...ST.map(s => [s, s])] }, { k: 'assign', label: '指派狀況', type: 'select', opts: [['已指派', '已指派'], ['未指派', '未指派']] }, { k: 'nurse', label: '主責人員', type: 'select', opts: staffOpts(CARE_ROLES, allCare) }, { k: 'notice', label: '面談通知', type: 'select', opts: [['已通知', '已通知'], ['未通知', '未通知']] }, KW_FILTER])}
    <div class="toolbar"><span>已選 <b class="selcount">${UI.sel.size}</b> 人</span><button class="btn sm" data-act="noticeBulk">面談通知</button>
      <label class="chk">指派給 ${sel('assignTo', staffOpts(), ME, 'id="assignTo" aria-label="指派對象"')}</label><button class="btn sm" data-act="assignBulk">指派</button>
      <span class="sp"></span><span class="legend"><span><i class="dot st0"></i>未開單</span><span><i class="dot st1"></i>起單</span><span><i class="dot st2"></i>處理中</span><span><i class="dot st3"></i>結案</span></span><button class="btn sm" data-act="exportTrack">匯出 Excel</button></div>
    ${tbl([
      { h: selHead, cls: 'cb', f: r => selCell(r.e.id, r.e.name) },
      { h: '員工', f: r => empCell(r.e) },
      { h: '年齡', cls: 'num', f: r => age(r.e.birth) },
      { h: '異常事件（滑鼠移上看說明）', f: r => evChips(r.evs) },
      { h: '最近通報', cls: 'nowrap', f: r => fmtD(r.last) },
      { h: '個案狀態', f: r => stPill(r.st) },
      { h: '面談通知', cls: 'nowrap', f: r => r.c?.noticeDate && r.c.status !== '結案' ? fmtD(r.c.noticeDate) : '<span class="faint">—</span>' },
      { h: '預定面談', cls: 'nowrap', f: r => r.c?.plannedDate && r.c.status !== '結案' ? fmtD(r.c.plannedDate) : '<span class="faint">—</span>' },
      { h: '員工回覆', cls: 'nowrap', f: r => !r.c?.noticeDate || r.c.status === '結案' ? '<span class="faint">—</span>' : r.c.replyDate ? `${pill(r.c.agree + '面談', r.c.agree === '同意' ? 'ok' : 'bad')}<span class="sub2">${fmtD(r.c.replyDate)}</span>` : `${pill('未回覆')} <button class="btn link" data-act="simReply" data-id="${r.e.id}">模擬回覆</button>` },
      { h: '主責護理師', f: r => r.c && r.c.status !== '結案' ? esc(staffName(r.c.nurse)) : '<span class="faint">未指派</span>' },
      { h: '', f: r => `<button class="btn sm" data-act="go" data-to="profile" data-id="${r.e.id}" data-tabk="profile" data-tab="case">開啟個案</button>` },
    ], rows, { empty: '目前沒有符合條件的異常追蹤個案' })}
    <p class="hint" style="padding:0 14px 12px">異常來源：健檢數據異常通報；人因、工作負荷、妊娠通報等依指引規則判定之異常。年齡關注門檻：未滿 18 歲或 ${SENIOR_AGE} 歲以上。</p></div>`;
}
ACT.exportTrack = () => exportCsv('異常追蹤', [
  { h: '帳號', v: r => r.e.id }, { h: '姓名', v: r => r.e.name }, { h: '廠區', v: r => siteName(r.e.site) }, { h: '部門', v: r => deptName(r.e.dept) }, { h: '年齡', v: r => age(r.e.birth) },
  { h: '異常事件', v: r => r.evs.map(x => `${EV[x.type].l}(${x.status})`).join('；') }, { h: '最近通報', v: r => r.last }, { h: '個案狀態', v: r => r.st },
  { h: '面談通知日期', v: r => r.c?.noticeDate || '' }, { h: '預定面談日期', v: r => r.c?.plannedDate || '' }, { h: '主責護理師', v: r => staffName(r.c?.nurse) },
], trackRows());
ACT.noticeBulk = () => { const ids = [...UI.sel]; if (!ids.length) return toast('請先勾選要通知的員工', 'warn'); openNotice(ids); };
ACT.notice = el => openNotice([el.dataset.id]);
function openNotice(ids) {
  const el = openModal({
    title: '面談通知',
    body: `<form><p class="mctx">通知對象：${ids.map(id => esc(emp(id).name)).join('、')}（${ids.length} 人）</p><div class="fgrid">
      ${fld('預定面談日期', dateInp('date', dIso(7)), { req: 1 })}${fld('時間', '<input type="time" name="time" value="10:00">')}${fld('地點', inp('place', '健康中心'))}
      ${fld('通知內容', txt('msg', '您好：依本公司健康管理計畫，邀請您於上述時間與職醫／職護進行健康面談，請點選信中連結回覆是否同意面談。若時間不便，請直接回覆另約時間。', 4), { cls: 'full' })}</div>
      <p class="hint">員工會收到 Email，回覆結果會顯示在「異常追蹤」的「員工回覆」欄。</p></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="sendNotice">寄出通知</button>`,
  });
  el.ctx.ids = ids;
}
ACT.sendNotice = () => {
  const o = formObj(curForm());
  if (!o.date) return toast('請選擇預定面談日期', 'warn');
  const ids = topModal().ctx.ids;
  for (const id of ids) {
    const c = ensureCase(id);
    Object.assign(c, { noticeDate: TODAY, plannedDate: o.date, replyDate: null, agree: null });
    setEventStatus(id, '起單', ['未開單']);
  }
  closeModal(); UI.sel.clear();
  commit(`已寄出 ${ids.length} 封面談通知`);
};
ACT.assignBulk = () => {
  const ids = [...UI.sel];
  if (!ids.length) return toast('請先勾選要指派的員工', 'warn');
  const to = $('#assignTo').value;
  for (const id of ids) { const c = ensureCase(id); c.nurse = to; setEventStatus(id, '起單', ['未開單']); }
  UI.sel.clear();
  commit(`已將 ${ids.length} 位員工指派給 ${staffName(to)}`);
};
ACT.simReply = el => { const c = S.cases[el.dataset.id]; Object.assign(c, { replyDate: TODAY, agree: '同意' }); commit(`已模擬 ${emp(el.dataset.id).name} 回覆：同意面談`); };

function dueText(d) {
  const n = diffDays(d, TODAY);
  return n < 0 ? pill(`逾期 ${-n} 天`, 'bad') : n === 0 ? pill('今天', 'warn') : pill(`${n} 天後`, 'info');
}
function homeTasks() {
  const rows = tasksOpen().sort((a, b) => (a.follow.date + a.follow.time).localeCompare(b.follow.date + b.follow.time));
  return `<div class="panel">${tbl([
    { h: '追蹤日期', cls: 'nowrap', f: r => `${fmtD(r.follow.date)} ${esc(r.follow.time || '')}<span class="sub2">${dueText(r.follow.date)}</span>` },
    { h: '員工', f: r => empCell(emp(r.empId)) },
    { h: '協助類別', f: r => esc(r.follow.cat) },
    { h: '負責人員', f: r => esc(staffName(r.follow.staff)) },
    { h: '來源紀錄', f: r => `${fmtD(r.date)} ${esc(r.cat)}<span class="sub2 clip">${esc(r.handling || r.explain)}</span>` },
    { h: '', f: r => `<button class="btn sm primary" data-act="doTask" data-id="${r.id}">新增追蹤紀錄</button>` },
  ], rows, { empty: '目前沒有待追蹤事項' })}<p class="hint" style="padding:0 14px 12px">協助紀錄選擇「追蹤」並儲存後會出現在這裡；新增追蹤紀錄後即視為完成。</p></div>`;
}
ACT.doTask = el => { const r = S.records.find(x => x.id === el.dataset.id); openRecord(r.empId, { fromTask: r.id, cat: r.follow.cat, types: r.types }); };
function homeDrafts() {
  const rows = S.records.filter(r => r.draft).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return `<div class="panel">${tbl([
    { h: '暫存日期', cls: 'nowrap', f: r => fmtD(r.updatedAt) },
    { h: '員工', f: r => empCell(emp(r.empId)) },
    { h: '協助類別', f: r => esc(r.cat) },
    { h: '內容摘要', f: r => `<span class="clip" style="display:block">${esc(r.explain || r.handling || '（尚未填寫內容）')}</span>` },
    { h: '', f: r => `<button class="btn sm primary" data-act="editRecord" data-id="${r.id}">繼續編輯</button>` },
  ], rows, { empty: '沒有未完成的暫存工作' })}</div>`;
}

/* ====================================================================
   EMPLOYEES
   ==================================================================== */
function empRows() {
  const f = fval('emp', { status: '在職' });
  return S.employees.filter(e => kwMatch(e, f.kw) && (!f.empNo || e.empNo.includes(f.empNo)) && orgMatch(e, f) && (!f.hcCat || e.hcCat === f.hcCat) && (!f.status || e.status === f.status));
}
VIEWS.employees = {
  title: () => '員工資料',
  render() {
    const rows = empRows();
    return `<div class="page-head"><div><h1>員工資料</h1><p class="sub">點姓名開啟員工個人首頁；所有頁面右上角都能以帳號或姓名快速搜尋。</p></div></div>
    <div class="panel">${filterForm('emp', [KW_FILTER, { k: 'empNo', label: '員工編號' }, ...ORG_FILTERS, { k: 'hcCat', label: '健檢類別', type: 'select', opts: ['A類', 'B類', 'T1類', 'T2類'] }, { k: 'status', label: '在職狀況', type: 'select', def: '在職', opts: ['在職', '留停', '離職'] }])}
      <div class="toolbar"><button class="btn sm primary" data-act="newEmp">＋ 新增員工</button><button class="btn sm" data-act="proto" data-what="批次資料匯入">批次匯入</button><span class="sp"></span><span class="muted">共 ${rows.length} 筆</span><button class="btn sm" data-act="exportEmp">下載查詢結果</button></div>
      ${tbl([
        { h: '帳號', f: e => `<span class="mono">${e.id}</span>` },
        { h: '姓名', f: e => nameBtn(e) },
        { h: '法人／公司', f: e => esc(entName(e.entity)) },
        { h: '廠／院區', f: e => esc(siteName(e.site)) },
        { h: '部門', f: e => esc(deptName(e.dept)) },
        { h: '性別', f: e => e.sex },
        { h: '生日（年齡）', cls: 'nowrap', f: e => `${fmtD(e.birth)}（${age(e.birth)}）` },
        { h: '健檢類別', f: e => e.hcCat },
        { h: '手機', cls: 'nowrap mono', f: e => e.phone },
        { h: '到職日期', cls: 'nowrap', f: e => fmtD(e.hire) },
        { h: '在職／使用狀態', f: e => pill(`${e.status}／${e.active ? '啟用' : '停用'}`, e.active && e.status === '在職' ? 'ok' : '') },
      ], rows)}</div>`;
  },
};
ACT.exportEmp = () => exportCsv('員工資料', [
  { h: '帳號', v: e => e.id }, { h: '員工編號', v: e => e.empNo }, { h: '姓名', v: e => e.name }, { h: '法人', v: e => entName(e.entity) }, { h: '廠區', v: e => siteName(e.site) },
  { h: '部門', v: e => deptName(e.dept) }, { h: '職稱', v: e => e.title }, { h: '性別', v: e => e.sex }, { h: '生日', v: e => e.birth }, { h: '健檢類別', v: e => e.hcCat },
  { h: '班別', v: e => e.shift }, { h: '手機', v: e => e.phone }, { h: 'Email', v: e => e.email }, { h: '到職日期', v: e => e.hire }, { h: '在職狀況', v: e => e.status },
], empRows());
ACT.newEmp = () => openEmpForm();
ACT.editEmp = el => openEmpForm(el.dataset.id);
function openEmpForm(id) {
  const e = id ? emp(id) : { id: '', name: '', sex: '', birth: '', site: 'S1', dept: 'D11', title: '', shift: '常日班', hcCat: 'A類', grade: '一般', lang: 'zh', phone: '', ext: '', email: '', email2: '', idMasked: '', hire: TODAY, active: true, status: '在職', nation: '中華民國', city: '', addr: '', note: '' };
  const isLatin = /^[A-Za-z]/.test(e.name);
  const last = id && !isLatin ? e.name.slice(0, 1) : '';
  const first = id ? (isLatin ? e.name : e.name.slice(1)) : '';
  const el = openModal({
    title: id ? '編輯員工資料' : '新增員工資料', size: 'lg',
    body: `<form><div class="fgrid">
      ${fld('使用狀態', `<div class="chks">${radios('active', [['1', '啟用'], ['0', '停用']], e.active ? '1' : '0')}</div>`)}
      ${fld('帳號', inp('id', e.id, id ? 'readonly' : 'placeholder="例如 YC0031"'), { req: 1 })}
      ${fld('身分證號', inp('idMasked', e.idMasked, 'placeholder="雛形僅顯示遮罩值"'))}
      ${fld('客戶等級', sel('grade', ['一般', '重點關懷'], e.grade), { req: 1 })}
      ${fld('姓氏', inp('last', last))}
      ${fld('名字', inp('first', first), { req: 1 })}
      ${fld('中間名', inp('middle', ''))}
      ${fld('性別', `<div class="chks">${radios('sex', ['男', '女'], e.sex)}</div>`, { req: 1 })}
      ${fld('生日', dateInp('birth', e.birth), { req: 1 })}
      ${fld('廠／院區', sel('site', SITE_OPTS, e.site), { req: 1 })}
      ${fld('部門', sel('dept', DEPT_OPTS, e.dept), { req: 1 })}
      ${fld('職稱', inp('title', e.title))}
      ${fld('班別', sel('shift', ['常日班', '輪班', '夜班'], e.shift))}
      ${fld('健檢類別', sel('hcCat', ['A類', 'B類', 'T1類', 'T2類'], e.hcCat))}
      ${fld('到職日期', dateInp('hire', e.hire))}
      ${fld('行動電話', inp('phone', e.phone))}
      ${fld('公司分機', inp('ext', e.ext))}
      ${fld('主要 Email', inp('email', e.email, 'type="email"'))}
      ${fld('次要 Email', inp('email2', e.email2 || '', 'type="email"'))}
      ${fld('國籍', sel('nation', ['中華民國', '越南', '泰國', '印尼', '菲律賓', '其他'], e.nation || (e.lang === 'vi' ? '越南' : e.lang === 'th' ? '泰國' : '中華民國')))}
      ${fld('問卷語系', sel('lang', LANGS, e.lang))}
      ${fld('縣市', inp('city', e.city || ''))}
      ${fld('地址', inp('addr', e.addr || ''), { cls: 'w2' })}
      ${fld('備註說明', txt('note', e.note || '', 3), { cls: 'full' })}
    </div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">關閉</button><button class="btn primary" data-act="saveEmp">儲存</button>`,
  });
  el.ctx.id = id;
}
ACT.saveEmp = () => {
  const o = formObj(curForm());
  const id = topModal().ctx.id;
  const name = `${o.last}${o.middle}${o.first}`.trim();
  const miss = [!o.id && '帳號', !o.first && '名字', !o.sex && '性別', !o.birth && '生日'].filter(Boolean);
  if (miss.length) return toast(`請填寫必填欄位：${miss.join('、')}`, 'warn');
  if (!id && S.employees.some(e => e.id.toLowerCase() === o.id.toLowerCase())) return toast(`帳號 ${o.id} 已存在`, 'warn');
  const d = deptOf(o.dept);
  if (d.site !== o.site) return toast(`部門「${d.name}」不屬於所選廠區，請重新選擇`, 'warn');
  const site = ORG.sites.find(s => s.id === o.site);
  const patch = { name, sex: o.sex, birth: o.birth, entity: site.entity, site: o.site, dept: o.dept, title: o.title, shift: o.shift, hcCat: o.hcCat, grade: o.grade, lang: o.lang, phone: o.phone, ext: o.ext, email: o.email, email2: o.email2, idMasked: o.idMasked, hire: o.hire, active: o.active === '1', nation: o.nation, city: o.city, addr: o.addr, note: o.note };
  if (id) Object.assign(emp(id), patch);
  else S.employees.push({ id: o.id.toUpperCase(), empNo: 'E' + (10500 + S.employees.length), status: '在職', ...patch });
  closeModal();
  if (!id) { persist(); go('profile', { id: o.id.toUpperCase() }); toast(`已新增員工 ${name}`); }
  else commit('已更新員工資料');
};

/* ====================================================================
   PROFILE
   ==================================================================== */
VIEWS.profile = {
  title: p => `員工個人首頁 · ${emp(p.id)?.name || ''}`,
  render(p) {
    const e = emp(p.id);
    if (!e) return '<div class="empty">找不到這位員工</div>';
    const evs = eventsByEmp()[e.id] || [];
    const st = caseStatus(e.id, evs);
    const t = curTab('profile', 'case');
    const body = { case: profileCase, hc: profileHc, ergo: profileErgo, wl: profileWl, mat: profileMat, survey: profileSurvey }[t](e, evs);
    return `<button class="btn link" data-act="go" data-to="employees">‹ 回員工資料</button>
    <section class="phead"><div class="avatar" aria-hidden="true">${esc(e.name.slice(0, 1))}</div>
      <div><h1>${esc(e.name)} <small>${e.id} · ${e.empNo}</small></h1>
        <div class="meta"><span>${e.sex}（${e.grade}）</span><span>${fmtD(e.birth)}（${ageYM(e.birth)}）</span><span>${esc(entName(e.entity))}／${esc(siteName(e.site))}／${esc(deptName(e.dept))}</span><span>${esc(e.title)} · ${e.shift}</span><span>健檢 ${e.hcCat}</span><span class="mono">${esc(e.email)}</span><span class="mono">${esc(e.phone)}</span><span>問卷語系：${LANGS.find(l => l[0] === e.lang)?.[1]}</span></div>
        <div class="evs">${evs.length ? evChips(evs) : '<span class="faint">目前無異常事件</span>'} ${evs.length ? stPill(st) : ''}</div></div>
      <div class="acts"><button class="btn primary" data-act="newRecord" data-id="${e.id}">新增協助紀錄</button><button class="btn" data-act="notice" data-id="${e.id}">面談通知</button><button class="btn ghost" data-act="editEmp" data-id="${e.id}">編輯基本資料</button></div></section>
    ${tabs('profile', [['case', '個案管理'], ['hc', '健檢報告分級'], ['ergo', '人因性危害'], ['wl', '異常工作負荷'], ['mat', '母性健康保護－個人評估'], ['survey', '問卷紀錄']])}
    ${body}`;
  },
};
function profileCase(e, evs) {
  const c = S.cases[e.id];
  const st = caseStatus(e.id, evs);
  const recs = S.records.filter(r => r.empId === e.id).sort((a, b) => (b.date + b.time).localeCompare(a.date + a.time));
  const open = c && c.status !== '結案';
  return `<div class="panel"><div class="phd"><h3>個案管理服務單</h3><div class="acts" style="display:flex;gap:8px">${open ? `<button class="btn sm danger" data-act="closeCase" data-id="${e.id}">結案</button>` : evs.length ? `<button class="btn sm primary" data-act="openCase" data-id="${e.id}">開單並指派給我</button>` : ''}</div></div>
    <div class="pbody"><dl class="kvgrid">
      <div><dt>服務單類別</dt><dd>個案管理</dd></div><div><dt>開單日期</dt><dd>${c ? fmtD(c.openDate) : '—'}</dd></div>
      <div><dt>主責護理師</dt><dd>${c ? esc(staffName(c.nurse)) : '未指派'}</dd></div><div><dt>處理狀態</dt><dd>${evs.length || c ? stPill(st) : '—'}</dd></div>
      <div><dt>面談通知日期</dt><dd>${open && c.noticeDate ? fmtD(c.noticeDate) : '—'}</dd></div><div><dt>預定面談</dt><dd>${open && c.plannedDate ? fmtD(c.plannedDate) : '—'}</dd></div>
      <div><dt>員工回覆</dt><dd>${open && c.replyDate ? `${esc(c.agree)}面談（${fmtD(c.replyDate)}）` : open && c.noticeDate ? '未回覆' : '—'}</dd></div>
    </dl></div>
    ${evs.length ? tbl([{ h: '事件類型', f: x => esc(EV[x.type].l) }, { h: '說明', f: x => esc(x.desc) }, { h: '通報日期', cls: 'nowrap', f: x => fmtD(x.date) }, { h: '事件狀態', f: x => stPill(x.status) }], evs) : '<div class="empty">此員工目前沒有異常事件</div>'}</div>
  <div class="panel"><div class="phd"><h3>諮詢協助單／處理狀況</h3><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn sm primary" data-act="newRecord" data-id="${e.id}">＋ 新增</button><button class="btn sm" data-act="notice" data-id="${e.id}">面談通知</button><button class="btn sm" data-act="exportRecs" data-id="${e.id}">匯出紀錄</button></div></div>
    ${tbl([
      { h: '協助類別', f: r => `${esc(r.cat)}${r.draft ? ' ' + pill('暫存', 'warn') : ''}` },
      { h: '發生日期時間', cls: 'nowrap', f: r => `${fmtD(r.date)} ${esc(r.time)}` },
      { h: '諮詢類型', f: r => `<span class="clip" style="display:block">${esc([...r.types, r.typeOther].filter(Boolean).join('、') || '—')}</span>` },
      { h: '處理狀況', f: r => `<span class="clip" style="display:block">${esc(r.handling || '—')}</span>` },
      { h: '協助紀錄結果', cls: 'nowrap', f: r => r.draft ? '<span class="faint">—</span>' : r.result === '結案' ? pill('結案', 'ok') : r.follow ? `${pill('追蹤', r.followDone ? '' : 'info')}<span class="sub2">${fmtD(r.follow.date)}${r.followDone ? ' 已完成' : ''}</span>` : '—' },
      { h: '協助人員（費時）', f: r => esc(r.helpers.map(h => `${staffName(h.staff)} ${h.min} 分`).join('、')) },
      { h: '最後異動', cls: 'nowrap', f: r => `${esc(staffName(r.updatedBy))}<span class="sub2">${fmtD(r.updatedAt)}</span>` },
      { h: '附件', f: r => r.files.length ? `${r.files.length} 個` : '—' },
      { h: '健康叮嚀', f: r => r.draft ? '—' : r.tipSent ? pill('已發送', 'ok') : `<button class="btn link" data-act="sendTip" data-id="${r.id}">未發送</button>` },
      { h: '', f: r => `<button class="btn sm" data-act="editRecord" data-id="${r.id}">編輯</button>` },
    ], recs, { empty: '尚無協助紀錄' })}</div>`;
}
ACT.openCase = el => { const c = ensureCase(el.dataset.id); c.nurse = ME; setEventStatus(el.dataset.id, '起單', ['未開單']); commit('已開單，主責護理師為' + staffName(ME)); };
ACT.closeCase = el => {
  const id = el.dataset.id;
  confirmBox('結案後，此員工目前所有異常事件會標示為「結案」，未完成的追蹤事項也會一併關閉。', () => {
    const c = S.cases[id];
    Object.assign(c, { status: '結案', closedDate: TODAY });
    setEventStatus(id, '結案');
    S.records.filter(r => r.empId === id).forEach(r => { r.followDone = true; });
    commit('個案已結案');
  }, '結案');
};
ACT.sendTip = el => { const r = S.records.find(x => x.id === el.dataset.id); r.tipSent = true; commit(`已寄送健康叮嚀給 ${emp(r.empId).name}`); };
ACT.exportRecs = el => exportCsv(`${emp(el.dataset.id).name} 協助紀錄`, [
  { h: '協助類別', v: r => r.cat }, { h: '日期', v: r => r.date }, { h: '時間', v: r => r.time }, { h: '諮詢類型', v: r => r.types.join('；') }, { h: '報告解說／健康諮詢', v: r => r.explain },
  { h: '生活指導', v: r => r.lifestyle.join('；') }, { h: '處理狀況', v: r => r.handling }, { h: '結果', v: r => r.draft ? '暫存' : r.result }, { h: '下次追蹤', v: r => r.follow?.date || '' },
], S.records.filter(r => r.empId === el.dataset.id));

function profileHc(e) {
  const reps = reportsOf(e.id);
  if (!reps.length) return '<div class="panel"><div class="empty">尚無健檢報告</div></div>';
  const cur = reps.find(r => r.id === UI.tab.hcRep) || reps[0];
  const prev = reps[reps.indexOf(cur) + 1];
  const g = gradeReport(cur);
  const pv = prev ? prev.values : null;
  const L = cur.life || {};
  return `<div class="split"><div class="panel" style="margin-top:0"><div class="phd"><h3>健檢報告</h3><button class="btn sm" data-act="proto" data-what="新增健檢報告">＋ 新增</button></div>
      <div class="replist">${reps.map(r => { const gg = gradeReport(r); return `<button class="${r === cur ? 'on' : ''}" data-act="pickRep" data-id="${r.id}"><span>${fmtD(r.date)}<span class="sub2">${esc(r.clinic)} · ${esc(r.kind)}</span></span>${gb(gg.max)}</button>`; }).join('')}</div></div>
    <div class="panel" style="margin-top:0"><div class="phd"><h3>${fmtD(cur.date)}（${esc(cur.clinic)}）</h3><div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap"><span>總分 <b class="mono">${g.total}</b></span><span>最大級 ${gb(g.max)}</span><button class="btn sm" data-act="go" data-to="rules">分級標準</button></div></div>
      <div class="pbody"><dl class="kvgrid"><div style="grid-column:1/-1"><dt>作業經歷</dt><dd>${esc(cur.work)}</dd></div><div><dt>既往病史</dt><dd>${esc(cur.history)}</dd></div>
        <div><dt>生活習慣</dt><dd>${L.smoke ? '吸菸' : '不吸菸'}、${L.drink ? '偶爾飲酒' : '不飲酒'}、不嚼檳榔、平均睡眠 ${L.sleep} 小時</dd></div><div><dt>自覺症狀</dt><dd>${esc(cur.symptoms)}</dd></div>
        ${cur.special ? `<div><dt>特殊健檢</dt><dd>${esc(cur.special.hazard)}：${pill(`第 ${cur.special.level} 級管理`, cur.special.level >= 2 ? 'warn' : 'ok')}</dd></div>` : ''}</dl></div>
      ${tbl([
        { h: '健檢項目', f: i => `${esc(i.name)}<span class="sub2 mono">${i.code}</span>` },
        { h: '檢驗值', cls: 'num', f: i => `<span class="${i.lv >= 2 ? 'hi' : ''}">${esc(i.v)}</span>` },
        { h: '單位', f: i => esc(i.unit) },
        { h: '檢驗標準', f: i => esc(i.std) },
        ...(pv ? [{ h: `前次（${fmtD(prev.date)}）`, cls: 'num faint', f: i => esc(pv[i.key]) }] : []),
        { h: '分級結果', f: i => `<span title="${esc(i.rule ? ruleTip(i.rule) : '無對應規則')}">${gb(i.lv)}</span>` },
      ], g.items)}
      <p class="hint" style="padding:0 16px 12px">滑鼠移到分級數字上可看判斷規則。依「分級標準」版本 V1 計算，修改規則後會即時重算。</p></div></div>`;
}
ACT.pickRep = el => { UI.tab.hcRep = el.dataset.id; render(); };

function nmqBars(s, lang = 'zh') {
  return bars(NMQ_KEYS.map(k => ({ label: partLabel(k.key, lang), value: s.nmq[k.key], display: `${s.nmq[k.key]} 分`, color: s.nmq[k.key] >= 3 ? 'bad' : s.nmq[k.key] === 2 ? 'warn' : 'accent' })), { max: 5 });
}
function profileErgo(e) {
  const s = latestErgo(e.id);
  if (!s) return '<div class="panel"><div class="empty">此員工尚未納入人因性危害調查</div></div>';
  const m = nmqMax(s);
  return `<div class="panel"><div class="phd"><h3>肌肉骨骼症狀調查（NMQ）· 調查日期 ${fmtD(s.date)}</h3><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">${s.status === '已填寫' ? pill(nmqHazardLabel(s), m >= 3 ? 'bad' : 'ok') : pill('未填寫', 'warn')}<button class="btn sm" data-act="fillNmq" data-id="${s.id}">${s.status === '已填寫' ? '檢視／修改' : '代填問卷'}</button>${s.status === '已填寫' && m >= 3 ? `<button class="btn sm" data-act="ergoTrack" data-id="${s.id}">管控追蹤</button>` : ''}</div></div>
    <div class="pbody">${s.status === '已填寫' ? `<p class="muted" style="margin-top:0">填寫日期 ${fmtD(s.filledAt)}（${s.filledBy === 'self' ? '本人填寫' : '職護代填'}）· 傷病紀錄：${s.injury ? '有' : '無'}</p>${nmqBars(s)}` : `<p class="muted">問卷已於 ${fmtD(s.sentAt)} 發送，尚未填寫；已催填 ${s.remind} 次。</p>`}
    ${s.track ? `<div class="callout"><b>管控追蹤（${esc(s.track.status)}）</b>：${esc(s.track.measures.join('、'))}。${esc(s.track.note)}（${fmtD(s.track.date)}）</div>` : ''}</div></div>`;
}
function profileWl(e) {
  const a = S.workload.filter(x => x.empId === e.id).sort((x, y) => y.date.localeCompare(x.date))[0];
  if (!a) return '<div class="panel"><div class="empty">此員工尚未納入異常工作負荷評估</div></div>';
  return `<div class="panel"><div class="phd"><h3>個人風險等級評估 · 評估日期 ${fmtD(a.date)}</h3><button class="btn sm" data-act="openInterview" data-id="${a.id}">醫師面談與健康指導</button></div><div class="pbody">${riskDetailHtml(a)}</div></div>`;
}
function profileMat(e) {
  const m = S.matCases.find(x => x.empId === e.id);
  if (!m) return `<div class="panel"><div class="empty">尚無妊娠或產後一年內通報紀錄${e.sex === '女' ? `<p><button class="btn sm primary" data-act="newMat" data-emp="${e.id}">新增通報</button></p>` : ''}</div></div>`;
  return `<div class="panel"><div class="phd"><h3>${esc(m.type)}通報 · ${fmtD(m.notifyDate)}</h3><button class="btn sm primary" data-act="openMat" data-id="${m.id}">開啟個人評估</button></div>
    <div class="pbody"><dl class="kvgrid"><div><dt>${m.type === '妊娠' ? '預產期' : '分娩日期'}</dt><dd>${fmtD(m.type === '妊娠' ? m.due : m.birthDate)}</dd></div><div><dt>目前懷孕週數</dt><dd>${pregWeeks(m) || '—'}</dd></div>
      <div><dt>作業環境管理等級</dt><dd>${pill(m.env.level, levelPill(m.env.level))}</dd></div><div><dt>面談日期</dt><dd>${m.interview?.date ? fmtD(m.interview.date) : '未面談'}</dd></div>
      <div><dt>員工確認</dt><dd>${pill(m.status, m.status === '已確認' ? 'ok' : m.status === '待員工確認' ? 'warn' : '')}</dd></div><div><dt>工作適性建議</dt><dd>${esc(m.fit?.advice || '—')}</dd></div></dl></div></div>`;
}
function profileSurvey(e) {
  const rows = [];
  for (const s of S.ergo.filter(x => x.empId === e.id)) rows.push({ n: '肌肉骨骼症狀調查表（NMQ）', sent: s.sentAt, st: s.status, at: s.filledAt, by: s.filledBy, lang: s.lang });
  for (const a of S.workload.filter(x => x.empId === e.id)) {
    rows.push({ n: '過勞量表', sent: a.sentAt, st: a.pf == null ? '未填寫' : '已填寫', at: a.fatigueAt, by: a.pf == null ? null : (a.cbiBy || 'self'), lang: 'zh' });
    rows.push({ n: '過負荷評估', sent: a.sentAt, st: a.m1 == null ? '未填寫' : '已填寫', at: a.overloadAt, by: a.m1 == null ? null : (a.olBy || 'self'), lang: 'zh' });
  }
  for (const m of S.matCases.filter(x => x.empId === e.id)) if (m.emailAt) rows.push({ n: '母性健康保護面談紀錄確認', sent: m.emailAt, st: m.status === '已確認' ? '已確認' : '未確認', at: m.confirmAt, by: m.confirmAt ? 'self' : null, lang: 'zh' });
  return `<div class="panel">${tbl([
    { h: '問卷／確認單', f: r => esc(r.n) }, { h: '發送日期', f: r => fmtD(r.sent) }, { h: '狀態', f: r => pill(r.st, r.st.startsWith('已') ? 'ok' : 'warn') },
    { h: '填寫日期', f: r => fmtD(r.at) || '—' }, { h: '填寫方式', f: r => r.by ? (r.by === 'self' ? '本人' : '職護代填') : '—' }, { h: '語系', f: r => LANGS.find(l => l[0] === r.lang)?.[1] || '' },
  ], rows, { empty: '尚無問卷紀錄' })}</div>`;
}

/* ====================================================================
   ASSIST RECORD (協助紀錄 / 面談紀錄)
   ==================================================================== */
function phrasePanel(cats, cur = cats[0]) {
  const list = S.phrases.filter(p => p.cat === cur);
  return `<h4>片語</h4><div class="ph-cats">${cats.map(c => `<button type="button" class="${c === cur ? 'on' : ''}" data-act="phraseCat" data-c="${esc(c)}" data-cats="${esc(cats.join('|'))}">${esc(c)}</button>`).join('')}</div>
    <div class="ph-list">${list.map(p => `<button type="button" class="ph-item" data-act="insPhrase" data-id="${p.id}">${esc(p.text)}</button>`).join('') || '<p class="hint">此分類尚無片語，可到「設定 › 片語庫」新增。</p>'}</div>
    <p class="hint">先點選表單中的文字欄位，再點片語即可帶入。</p>`;
}
ACT.phraseCat = el => { topModal().querySelector('.mside').innerHTML = phrasePanel(el.dataset.cats.split('|'), el.dataset.c); };
ACT.insPhrase = el => {
  const p = S.phrases.find(x => x.id === el.dataset.id);
  const m = topModal();
  const t = UI.lastField && m.contains(UI.lastField) ? UI.lastField : m.querySelector('[data-ph]');
  if (!t) return;
  t.value = t.value ? t.value.replace(/\s*$/, '') + '\n' + p.text : p.text;
  t.classList.remove('flash'); void t.offsetWidth; t.classList.add('flash');
  t.focus();
};
function defaultTypes(e) {
  const map = { hc: CONSULT_TYPES[0], sp: CONSULT_TYPES[1], er: CONSULT_TYPES[2], wl: CONSULT_TYPES[4], mat: CONSULT_TYPES[5], age: CONSULT_TYPES[6] };
  return [...new Set((eventsByEmp()[e.id] || []).filter(x => x.status !== '結案').map(x => map[x.type]))];
}
ACT.newRecord = el => openRecord(el.dataset.id);
ACT.editRecord = el => { const r = S.records.find(x => x.id === el.dataset.id); openRecord(r.empId, { id: r.id }); };
function openRecord(eid, o = {}) {
  const e = emp(eid);
  const r = o.id ? S.records.find(x => x.id === o.id) : null;
  const v = r || { cat: o.cat || '健康面談諮詢紀錄', date: TODAY, time: nowHM(), types: o.types || defaultTypes(e), typeOther: '', explain: '', lifestyle: [], lifeOther: '', handling: '', note: '', helpers: [{ staff: ME, min: 20 }], files: [], result: '追蹤', follow: null };
  const c = S.cases[e.id];
  const fol = v.follow || { date: dIso(14), time: '10:00', staff: ME, cat: v.cat };
  const result = v.result || '追蹤';
  const team = staffOpts(CARE_ROLES, [...v.helpers.map(h => h.staff), fol.staff]);
  const el = openModal({
    title: r ? '編輯協助紀錄' : '新增協助紀錄', size: 'lg', side: phrasePanel(['健康諮詢', '健康諮詢_運動', '處理狀況']),
    body: `<form>
      <p class="mctx">${c && c.status !== '結案' ? `${fmtD(c.openDate)}－個案管理（${esc(caseStatus(e.id, eventsByEmp()[e.id]))}）` : '此員工尚未開單：正式儲存後會自動開立個案管理服務單'}${o.fromTask ? '　·　由待追蹤事項建立' : ''}</p>
      <div class="fgrid">${fld('協助對象', `<input value="${esc(e.name)}（${e.id}）" readonly>`)}${fld('協助類別', sel('cat', ASSIST_CATS, v.cat), { req: 1 })}${fld('發生日期', dateInp('date', v.date), { req: 1 })}${fld('發生時間', `<input type="time" name="time" value="${esc(v.time)}">`)}</div>
      <div class="fsec"><h3>諮詢類型</h3>${chks('types', CONSULT_TYPES, v.types)}<div style="margin-top:8px;max-width:420px">${fld('其他', inp('typeOther', v.typeOther))}</div></div>
      <div class="fsec"><h3>報告解說／健康諮詢</h3>${txt('explain', v.explain, 4, 'data-ph aria-label="報告解說／健康諮詢"')}</div>
      <div class="fsec"><h3>生活指導</h3>${chks('lifestyle', LIFESTYLE, v.lifestyle)}<div style="margin-top:8px;max-width:420px">${fld('其他', inp('lifeOther', v.lifeOther))}</div></div>
      <div class="fsec"><h3>處理狀況與備註</h3><div class="fgrid">${fld('處理狀況', txt('handling', v.handling, 3), { cls: 'full' })}${fld('備註', txt('note', v.note, 2), { cls: 'full' })}</div></div>
      <div class="fsec"><h3>協助人員與附件</h3><div class="fgrid">
        ${fld('協助人員', sel('helper', team, v.helpers[0]?.staff))}${fld('費時（分鐘）', `<input type="number" name="minutes" min="0" value="${v.helpers[0]?.min ?? 20}">`)}
        ${fld('協助人員 2', sel('helper2', [['', '（無）'], ...team], v.helpers[1]?.staff || ''))}${fld('費時（分鐘）', `<input type="number" name="minutes2" min="0" value="${v.helpers[1]?.min ?? ''}">`)}
        ${fld('附件上傳（JPEG、PNG、PDF；檔名限 20 字）', '<input type="file" name="files" multiple accept=".jpg,.jpeg,.png,.pdf">', { cls: 'w2' })}
        ${v.files.length ? `<div class="full hint">已上傳：${v.files.map(esc).join('、')}</div>` : ''}</div></div>
      <div class="fsec"><h3>協助紀錄結果</h3><div class="chks">${radios('result', [['追蹤', '追蹤'], ['結案', '結案（結束此個案）']], result, 'data-change="resultToggle"')}</div>
        <div class="fgrid" id="followBox" style="margin-top:10px" ${result === '結案' ? 'hidden' : ''}>
          ${fld('下次追蹤日期', dateInp('fDate', fol.date), { req: 1 })}${fld('時間', `<input type="time" name="fTime" value="${esc(fol.time)}">`)}
          ${fld('負責職醫護人員', sel('fStaff', team, fol.staff))}${fld('協助類別', sel('fCat', ASSIST_CATS, fol.cat))}</div>
        <p class="hint">選「追蹤」會在首頁「待追蹤事項」與行事曆出現；選「結案」則不會。按「暫存」可先存草稿，顯示在首頁提醒。</p></div>
    </form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="healthEval" data-id="${e.id}">健康評估</button></div><button class="btn ghost" data-act="closeModal">取消</button><button class="btn warn" data-act="saveRecord" data-draft="1">暫存</button><button class="btn primary" data-act="saveRecord">儲存</button>`,
  });
  Object.assign(el.ctx, { empId: e.id, id: r?.id, fromTask: o.fromTask });
}
ACT.resultToggle = el => { topModal().querySelector('#followBox').hidden = el.value === '結案'; };
ACT.healthEval = el => {
  const a = S.workload.find(x => x.empId === el.dataset.id);
  if (a) return openRisk(a.id);
  toast('此員工尚無異常工作負荷評估資料，請到「健檢報告分級」查看健檢結果', 'info');
};
ACT.saveRecord = el => {
  const draft = !!el.dataset.draft;
  const f = curForm();
  const o = formObj(f);
  const x = topModal().ctx;
  if (!draft) {
    if (!o.date) return toast('請填寫發生日期', 'warn');
    if (!o.types.length && !o.typeOther) return toast('請至少勾選一項諮詢類型', 'warn');
    if (o.result === '追蹤' && !o.fDate) return toast('選擇「追蹤」時，請填寫下次追蹤日期', 'warn');
    if (o.result === '追蹤' && !staff(o.fStaff)?.active) return toast(`${staffName(o.fStaff)} 已停用，請改選其他負責人員`, 'warn');
  }
  const files = [...(f.querySelector('[name=files]')?.files || [])].map(fl => fl.name);
  const tooLong = files.find(n => n.replace(/\.[^.]+$/, '').length > 20);
  if (tooLong) return toast(`檔名超過 20 字：${tooLong}`, 'warn');
  let r = x.id ? S.records.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('AR'), empId: x.empId, tipSent: false, followDone: false, files: [] }; S.records.push(r); }
  Object.assign(r, {
    cat: o.cat, date: o.date || TODAY, time: o.time, types: o.types, typeOther: o.typeOther, explain: o.explain, lifestyle: o.lifestyle, lifeOther: o.lifeOther, handling: o.handling, note: o.note,
    helpers: [{ staff: o.helper, min: +o.minutes || 0 }, ...(o.helper2 ? [{ staff: o.helper2, min: +o.minutes2 || 0 }] : [])], files: [...r.files, ...files],
    result: o.result, follow: o.result === '追蹤' ? { date: o.fDate, time: o.fTime, staff: o.fStaff, cat: o.fCat } : null, draft, updatedBy: ME, updatedAt: TODAY,
  });
  if (!draft) {
    if (x.fromTask) { const t = S.records.find(z => z.id === x.fromTask); if (t) t.followDone = true; }
    const c = ensureCase(x.empId);
    if (o.result === '結案') {
      Object.assign(c, { status: '結案', closedDate: TODAY });
      setEventStatus(x.empId, '結案');
      S.records.filter(z => z.empId === x.empId && z !== r).forEach(z => { z.followDone = true; });
    } else { c.status = '處理中'; setEventStatus(x.empId, '處理中', ['未開單', '起單']); }
  }
  closeModal();
  commit(draft ? '已暫存，可在首頁「未完成暫存工作」繼續編輯' : o.result === '結案' ? '已儲存，個案已結案' : `已儲存，追蹤事項排定於 ${fmtD(o.fDate)}`);
};
