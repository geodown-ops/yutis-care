'use strict';
/* Yutis Care prototype: the four prevention programmes and the labour health service record (附表八). */

const docs = (keep = []) => staffOpts(CARE_ROLES, keep);
const docsAll = () => staffOpts(CARE_ROLES, S.staff.map(s => s.id));
const vioPill = l => l ? pill(l, l === '高度風險' ? 'bad' : l === '中度風險' ? 'warn' : 'ok') : '<span class="faint">—</span>';
const deptOptsFor = site => [['', '（不指定）'], ...ORG.depts.filter(d => !site || d.site === site).map(d => [d.id, d.name])];
const fileNames = f => [...(f.querySelector('[type=file]')?.files || [])].map(x => x.name);

/* ---------- shared: sign-off ---------- */
function signerRow(s = { role: '', name: '', email: '' }) {
  return `<tr><td>${sel('sRole[]', SIGN_ROLES, s.role, 'aria-label="人員類別"')}</td><td><input name="sName[]" value="${esc(s.name)}" list="staffList" data-change="signerName" aria-label="姓名" placeholder="依姓名／Email 尋找"></td>
    <td><input name="sEmail[]" type="email" value="${esc(s.email)}" aria-label="Email"></td><td class="nowrap">${s.confirmed ? pill('已確認 ' + fmtD(s.confirmed), 'ok') : s.sentFirst ? pill('已寄送，待確認', 'info') : pill('未寄送')}</td>
    <td><button type="button" class="btn sm ghost" data-act="rmSigner" aria-label="移除此簽核人">×</button></td></tr>`;
}
function signersEditor(list) {
  const names = [...new Set([...S.staff.filter(s => s.active).map(s => s.name), ...ORG.depts.map(d => d.mgr)])];
  return `<datalist id="staffList">${names.map(n => `<option value="${esc(n)}">`).join('')}</datalist>
    <div class="tbl-wrap"><table class="tbl form"><thead><tr><th>人員類別</th><th>姓名</th><th>Email</th><th>狀態</th><th></th></tr></thead><tbody class="signers">${list.map(signerRow).join('')}</tbody></table></div>
    <button type="button" class="btn sm" data-act="addSigner" style="margin-top:8px">＋ 新增簽核人</button>`;
}
ACT.addSigner = el => el.closest('form').querySelector('tbody.signers').insertAdjacentHTML('beforeend', signerRow());
ACT.rmSigner = el => el.closest('tr').remove();
ACT.signerName = el => {
  const em = el.closest('tr').querySelector('[name="sEmail[]"]');
  if (em.value) return;
  em.value = S.staff.find(s => s.name === el.value)?.email || ORG.depts.find(d => d.mgr === el.value)?.mgrEmail || '';
};
function readSigners(o, old = []) {
  return (o.sRole || []).map((role, i) => {
    const name = o.sName[i], email = o.sEmail[i];
    const prev = old.find(s => s.name === name && s.role === role) || {};
    return { role, name, email, sentFirst: prev.sentFirst || null, sentLast: prev.sentLast || null, confirmed: prev.confirmed || null, comment: prev.comment || '' };
  }).filter(s => s.name || s.email);
}
function sendSign(rec) {
  let n = 0;
  for (const s of rec.signers) if (s.email && !s.confirmed) { s.sentFirst ||= TODAY; s.sentLast = TODAY; n++; }
  return n;
}
const signSummary = r => {
  const t = (r.signers || []).length;
  if (!t) return '<span class="faint">未設定</span>';
  const c = r.signers.filter(s => s.confirmed).length;
  return pill(`${c}／${t} 已確認`, c === t ? 'ok' : r.signers.some(s => s.sentFirst) ? 'info' : '');
};
ACT.signLog = el => {
  const rec = S[el.dataset.coll].find(x => x.id === el.dataset.id);
  if (!rec) return toast('請先儲存，再查詢確認紀錄', 'warn');
  const m = openModal({
    title: '確認紀錄查詢', size: 'lg',
    body: tbl([{ h: '人員類別', f: s => esc(s.role) }, { h: '姓名', f: s => esc(s.name) }, { h: '第一次寄送日期', f: s => fmtD(s.sentFirst) || '—' }, { h: '最後一次寄送日期', f: s => fmtD(s.sentLast) || '—' }, { h: '確認日期', f: s => s.confirmed ? fmtD(s.confirmed) : '<span class="faint">未確認</span>' }, { h: '回覆意見內容', f: s => esc(s.comment) || '—' }], rec.signers, { empty: '尚未設定簽核人' }),
    foot: `<span class="muted" style="margin-right:auto">確認狀態依簽核人點選 Email 連結回寫</span><button class="btn" data-act="simConfirm">模擬全部確認</button><button class="btn ghost" data-act="closeModal">關閉</button>`,
  });
  m.ctx = { coll: el.dataset.coll, id: el.dataset.id };
};
ACT.simConfirm = () => {
  const { coll, id } = topModal().ctx;
  const rec = S[coll].find(x => x.id === id);
  const n = rec.signers.filter(s => s.sentFirst && !s.confirmed).length;
  rec.signers.forEach(s => { if (s.sentFirst && !s.confirmed) s.confirmed = TODAY; });
  while (MODALS.length) closeModal();
  commit(n ? `已模擬 ${n} 位簽核人確認` : '沒有待確認的簽核人（請先 Email 簽送）', n ? 'ok' : 'info');
};
const printBtns = `<button class="btn ghost" data-act="proto" data-what="列印（正式版輸出 PDF）">列印</button><button class="btn ghost" data-act="proto" data-what="自訂頁首頁尾">自訂頁首頁尾</button>`;

/* ---------- shared: questionnaire dispatch ---------- */
function openDispatch(kind) {
  const el = openModal({
    title: kind === 'nmq' ? '問卷發送：肌肉骨骼症狀調查表' : '問卷發送：過勞量表＋過負荷評估', size: 'lg',
    body: `<form><div class="fgrid">${fld('法人／公司', sel('entity', [['', '全部'], ...ORG.entities.map(x => [x.id, x.name])], '', 'data-change="dispFilter"'))}${fld('廠／院區', sel('site', [['', '全部'], ...SITE_OPTS], '', 'data-change="dispFilter"'))}${fld('部門', sel('dept', [['', '全部'], ...DEPT_OPTS], '', 'data-change="dispFilter"'))}${fld('調查日期', dateInp('date', TODAY), { req: 1 })}</div>
      <div id="dispList" style="margin-top:12px">${dispList(kind, {})}</div></form>`,
    foot: `<span class="muted" style="margin-right:auto">問卷依員工設定的語系寄出，員工可在問卷中自行切換語系</span><button class="btn ghost" data-act="closeModal">返回</button><button class="btn primary" data-act="dispSend">發送問卷</button>`,
  });
  el.ctx.kind = kind;
}
function dispList(kind, f) {
  const list = S.employees.filter(e => e.status === '在職' && orgMatch(e, f) && (!f.entity || e.entity === f.entity));
  const pending = new Set((kind === 'nmq' ? S.ergo.filter(s => s.status === '未填寫') : S.workload.filter(a => a.pf == null || a.m1 == null)).map(s => s.empId));
  return tbl([
    { h: '<input type="checkbox" data-change="pickAll" aria-label="全選">', cls: 'cb', f: e => `<input type="checkbox" name="pick[]" value="${e.id}" ${pending.has(e.id) ? 'disabled' : ''} aria-label="選取 ${esc(e.name)}">` },
    { h: '法人／公司', f: e => esc(entName(e.entity)) }, { h: '廠／院區', f: e => esc(siteName(e.site)) }, { h: '部門', f: e => esc(deptName(e.dept)) },
    { h: '員工帳號', f: e => `<span class="mono">${e.id}</span>` }, { h: '員工姓名', f: e => esc(e.name) }, { h: '職稱', f: e => esc(e.title) },
    { h: '語系', f: e => LANGS.find(l => l[0] === e.lang)[1] }, { h: '訊息', f: e => pending.has(e.id) ? pill('已有未填問卷', 'warn') : e.email ? '' : pill('缺少 Email', 'bad') },
  ], list, { empty: '此條件下沒有在職員工' });
}
ACT.dispFilter = () => { topModal().querySelector('#dispList').innerHTML = dispList(topModal().ctx.kind, formObj(curForm())); };
ACT.pickAll = el => topModal().querySelectorAll('input[name="pick[]"]:not(:disabled)').forEach(c => { c.checked = el.checked; });
ACT.dispSend = () => {
  const o = formObj(curForm());
  const ids = o.pick || [];
  if (!ids.length) return toast('請勾選要發送問卷的員工', 'warn');
  if (!o.date) return toast('請填寫調查日期', 'warn');
  const kind = topModal().ctx.kind;
  for (const id of ids) {
    if (kind === 'nmq') S.ergo.push({ id: uid('ER'), batch: 'B' + o.date, date: o.date, empId: id, sentAt: TODAY, status: '未填寫', filledAt: null, filledBy: null, lang: emp(id).lang, injury: null, nmq: null, remind: 0, lastRemind: null, track: null });
    else S.workload.push({ id: uid('WL'), date: o.date, empId: id, sentAt: TODAY, pf: null, wf: null, cbi: null, fatigueAt: null, m1: null, avg6: null, patterns: [], overloadAt: null, interview: null });
  }
  closeModal();
  commit(`已發送 ${ids.length} 份問卷，可到「員工端預覽」模擬員工填寫`);
};

/* ====================================================================
   ERGONOMICS (人因性危害)
   ==================================================================== */
function ergoRows() {
  const f = fval('ergo');
  const flags = f.flags || [];
  return S.ergo.filter(s => {
    const e = emp(s.empId), m = nmqMax(s);
    return orgMatch(e, f) && kwMatch(e, f.kw) && inRange(s.date, f, 'd')
      && (!f.hz || (f.hz === '疑似有危害' ? m >= 3 : s.status === '已填寫' && m < 3))
      && (!flags.includes('問卷未填寫') || s.status === '未填寫') && (!flags.includes('有傷病紀錄') || s.injury);
  }).sort((a, b) => b.date.localeCompare(a.date) || (nmqMax(b) ?? -1) - (nmqMax(a) ?? -1));
}
VIEWS.ergo = {
  title: () => '人因性危害預防計畫',
  render() {
    const t = curTab('ergo', 'list');
    const body = t === 'list' ? ergoList() : t === 'injury' ? ergoInjury() : `<div style="margin-top:14px">${reportBody('ergo')}</div>`;
    return `<div class="page-head"><div><h1>人因性危害預防計畫</h1><p class="sub">發送肌肉骨骼症狀調查（NMQ）、追蹤傷病現況，任一部位 3 分以上判定為疑似有危害並列入管控追蹤。</p></div></div>
      ${tabs('ergo', [['list', '人因性危害'], ['injury', '傷病現況調查'], ['stat', '統計報表']])}${body}`;
  },
};
function ergoList() {
  const rows = ergoRows();
  return `<div class="panel">${filterForm('ergo', [{ k: 'd', label: '調查日期', type: 'date2' }, ...ORG_FILTERS, { k: 'hz', label: '危害等級', type: 'select', opts: ['疑似有危害', '無明顯危害'] }, KW_FILTER, { k: 'flags', label: '其他條件', type: 'checks', opts: ['問卷未填寫', '有傷病紀錄'] }])}
    <div class="toolbar"><button class="btn sm primary" data-act="ergoSend">問卷發送</button><button class="btn sm" data-act="ergoRemind">未填寫通知</button><button class="btn sm" data-act="proto" data-what="匯入名單">匯入</button><button class="btn sm" data-act="proto" data-what="問卷結果匯入">問卷結果匯入</button><span class="sp"></span><span class="muted">共 ${rows.length} 筆，未填寫 ${rows.filter(s => s.status === '未填寫').length} 筆</span><button class="btn sm" data-act="exportErgo">匯出</button></div>
    ${tbl([
      { h: '調查日期', cls: 'nowrap', f: s => fmtD(s.date) },
      { h: '員工', f: s => empCell(emp(s.empId)) },
      { h: '傷病現況調查', f: s => s.status !== '已填寫' ? '<span class="faint">—</span>' : s.injury ? pill('有紀錄', 'warn') : '無紀錄' },
      { h: '肌肉骨骼症狀調查', f: s => s.status === '已填寫' ? `<button class="btn link" data-act="fillNmq" data-id="${s.id}">已填寫</button><span class="sub2">${fmtD(s.filledAt)} · ${s.filledBy === 'self' ? '本人' : '代填'} · ${LANGS.find(l => l[0] === s.lang)?.[1]}</span>` : `${pill('未填寫', 'warn')} <button class="btn link" data-act="fillNmq" data-id="${s.id}">代填</button><span class="sub2">已催填 ${s.remind} 次</span>` },
      { h: '危害等級', f: s => s.status !== '已填寫' ? '<span class="faint">—</span>' : pill(nmqHazardLabel(s), nmqMax(s) >= 3 ? 'bad' : 'ok') },
      { h: '管控追蹤', f: s => nmqMax(s) >= 3 ? (s.track ? `${pill(s.track.status, s.track.status === '列管中' ? 'warn' : 'ok')} <button class="btn link" data-act="ergoTrack" data-id="${s.id}">編輯</button>` : `<button class="btn sm" data-act="ergoTrack" data-id="${s.id}">列管</button>`) : '<span class="faint">—</span>' },
    ], rows)}</div>`;
}
ACT.ergoSend = () => openDispatch('nmq');
ACT.ergoRemind = () => {
  const list = ergoRows().filter(s => s.status === '未填寫');
  if (!list.length) return toast('目前篩選結果中沒有未填寫的問卷', 'info');
  list.forEach(s => { s.remind++; s.lastRemind = TODAY; });
  commit(`已寄出 ${list.length} 封催填通知`);
};
ACT.exportErgo = () => exportCsv('人因性危害調查', [
  { h: '調查日期', v: s => s.date }, { h: '帳號', v: s => s.empId }, { h: '姓名', v: s => emp(s.empId).name }, { h: '部門', v: s => deptName(emp(s.empId).dept) },
  { h: '狀態', v: s => s.status }, { h: '危害等級', v: s => nmqHazardLabel(s) }, ...NMQ_KEYS.map(k => ({ h: partLabel(k.key), v: s => s.nmq ? s.nmq[k.key] : '' })),
], ergoRows());

function nmqFields(lang, s, narrow = false) {
  const T = I18N[lang];
  const v = s.nmq || {};
  const b = s.basic || {};
  return `<div class="fsec" style="margin-top:0"><h3>${esc(T.basic)}</h3><div class="fgrid">${fld(T.height + '（cm）', `<input type="number" name="h" value="${esc(b.h || '')}" min="100" max="220">`)}${fld(T.weight + '（kg）', `<input type="number" name="w" value="${esc(b.w || '')}" min="25" max="200" step="0.1">`)}${fld(T.hand, `<div class="chks">${radios('hand', [['L', T.leftHand], ['R', T.rightHand]], b.hand || '')}</div>`)}</div></div>
    <div class="fsec"><h3>${esc(T.q1)}</h3><div class="chks">${radios('any', [['1', T.yes], ['0', T.no]], s.nmq ? (Object.values(v).some(x => x > 0) ? '1' : '0') : '')}</div></div>
    <div class="fsec"><h3>${esc(T.injury)}</h3><div class="chks">${radios('injury', [['1', T.yes], ['0', T.no]], s.injury == null ? '' : s.injury ? '1' : '0')}</div></div>
    <div class="fsec"><h3>${esc(T.partsTitle)}</h3><div class="scale">${T.scale.map((x, i) => `<span><b class="mono">${i}</b> ${esc(x)}</span>`).join('')}</div>
    <div class="nmq ${narrow ? 'narrow' : ''}">${NMQ_KEYS.map(k => `<div class="np"><div><span>${esc(partLabel(k.key, lang))}</span></div><div class="seg" role="radiogroup" aria-label="${esc(partLabel(k.key, lang))}">${[0, 1, 2, 3, 4, 5].map(n => `<label class="${n >= 3 ? 'hiv' : ''}"><input type="radio" name="p_${k.key}" value="${n}" ${(v[k.key] ?? 0) === n ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div></div>`).join('')}</div></div>`;
}
function readNmq(o) {
  return { nmq: Object.fromEntries(NMQ_KEYS.map(k => [k.key, +o['p_' + k.key] || 0])), injury: o.injury === '1', basic: { h: o.h, w: o.w, hand: o.hand } };
}
ACT.fillNmq = el => {
  const s = S.ergo.find(x => x.id === el.dataset.id);
  const e = emp(s.empId);
  const m = openModal({
    title: `肌肉骨骼症狀調查表 · ${e.name}`, size: 'lg',
    body: `<form><p class="mctx">${s.status === '未填寫' ? '職護代填：填寫方式會記錄為「職護代填」' : `${fmtD(s.filledAt)} ${s.filledBy === 'self' ? '本人填寫' : '職護代填'}，修改後會重新判定危害等級`}</p>${nmqFields('zh', s)}</form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveNmq">儲存</button>`,
  });
  m.ctx.id = s.id;
};
ACT.saveNmq = () => {
  const s = S.ergo.find(x => x.id === topModal().ctx.id);
  const o = formObj(curForm());
  if (!o.injury) return toast('請回答「是否曾因工作受傷或請病假」', 'warn');
  Object.assign(s, readNmq(o), { status: '已填寫', filledAt: s.filledAt || TODAY, filledBy: s.filledBy || 'nurse' });
  closeModal();
  const m = nmqMax(s);
  commit(m >= 3 ? `已儲存：${nmqHazardLabel(s)}，已產生人因性危害異常事件` : '已儲存：無明顯危害');
};
ACT.ergoTrack = el => {
  const s = S.ergo.find(x => x.id === el.dataset.id);
  const t = s.track || { measures: [], note: '', date: dIso(14), status: '列管中' };
  const parts = NMQ_KEYS.filter(k => s.nmq[k.key] >= 3).map(k => `${partLabel(k.key)} ${s.nmq[k.key]} 分`).join('、');
  const m = openModal({
    title: `管控追蹤 · ${emp(s.empId).name}`,
    body: `<form><p class="mctx">疑似有危害部位：${esc(parts)}</p><div class="fsec" style="margin-top:0"><h3>改善措施</h3>${chks('measures', ERGO_MEASURES, t.measures)}</div>
      <div class="fgrid" style="margin-top:14px">${fld('說明', txt('note', t.note, 3), { cls: 'full' })}${fld('下次追蹤日期', dateInp('date', t.date))}${fld('列管狀態', sel('status', ['列管中', '已改善', '解除列管'], t.status))}</div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveTrack">儲存</button>`,
  });
  m.ctx.id = s.id;
};
ACT.saveTrack = () => {
  const s = S.ergo.find(x => x.id === topModal().ctx.id);
  const o = formObj(curForm());
  if (!o.measures.length && !o.note) return toast('請勾選改善措施或填寫說明', 'warn');
  s.track = { measures: o.measures, note: o.note, date: o.date, status: o.status };
  closeModal(); commit('已儲存管控追蹤');
};
function ergoInjury() {
  return `<div class="panel"><div class="toolbar" style="border-top:0"><button class="btn sm primary" data-act="newInjury">＋ 新增傷病紀錄</button><span class="sp"></span><span class="muted">職業傷病與請假情形</span></div>
    ${tbl([{ h: '發生日期', f: r => fmtD(r.date) }, { h: '員工', f: r => empCell(emp(r.empId)) }, { h: '受傷部位', f: r => esc(r.part) }, { h: '傷病描述', f: r => esc(r.desc) }, { h: '請假天數', cls: 'num', f: r => r.leave }], [...S.injuries].sort((a, b) => b.date.localeCompare(a.date)), { empty: '尚無傷病紀錄' })}</div>`;
}
ACT.newInjury = () => openModal({
  title: '新增傷病紀錄',
  body: `<form><div class="fgrid">${fld('發生日期', dateInp('date', TODAY), { req: 1 })}${fld('員工', sel('empId', S.employees.map(e => [e.id, `${e.name}（${e.id}）`])), { req: 1 })}${fld('受傷部位', inp('part', '', 'placeholder="例如 下背"'), { req: 1 })}${fld('請假天數', '<input type="number" name="leave" min="0" value="0">')}${fld('傷病描述', txt('desc', '', 3), { cls: 'full' })}</div></form>`,
  foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveInjury">儲存</button>`,
});
ACT.saveInjury = () => {
  const o = formObj(curForm());
  if (!o.date || !o.part) return toast('請填寫發生日期與受傷部位', 'warn');
  S.injuries.push({ id: uid('IJ'), date: o.date, empId: o.empId, part: o.part, desc: o.desc, leave: +o.leave || 0 });
  closeModal(); commit('已新增傷病紀錄');
};

/* ====================================================================
   OVERWORK (異常工作負荷)
   ==================================================================== */
function wlRows() {
  const f = fval('wl');
  const miss = f.miss || [];
  return S.workload.filter(a => {
    const e = emp(a.empId), w = evalWorkload(a);
    return orgMatch(e, f) && kwMatch(e, f.kw) && inRange(a.date, f, 'd') && (!f.advice || (w.complete && w.advice === f.advice))
      && (!miss.includes('過勞量表') || a.pf == null) && (!miss.includes('過負荷評估') || a.m1 == null);
  }).sort((a, b) => b.date.localeCompare(a.date) || (evalWorkload(b).riskLevel ?? -1) - (evalWorkload(a).riskLevel ?? -1));
}
VIEWS.workload = {
  title: () => '異常工作負荷促發疾病預防計畫',
  render() {
    const t = curTab('workload', 'assess');
    const body = { assess: wlAssess, interview: wlInterviews, log: wlLog }[t]();
    return `<div class="page-head"><div><h1>異常工作負荷促發疾病預防計畫</h1><p class="sub">結合健檢資料（十年心血管風險）與過勞量表、加班時數、工作型態，判定職業促發腦心血管疾病風險並安排醫師面談。</p></div></div>
      ${tabs('workload', [['assess', '辨識及評估高風險群'], ['interview', '醫師面談與健康指導'], ['log', '執行紀錄表']])}${body}`;
  },
};
function wlAssess() {
  const rows = wlRows();
  const fill = (a, k, act, at) => a[k] == null ? `${pill('未填寫', 'warn')} <button class="btn link" data-act="${act}" data-id="${a.id}">代填</button>` : `<button class="btn link" data-act="${act}" data-id="${a.id}">${fmtD(a[at])}</button>`;
  return `<div class="panel">${filterForm('wl', [{ k: 'd', label: '評估日期', type: 'date2' }, ...ORG_FILTERS, { k: 'advice', label: '面談建議', type: 'select', opts: ADVICE }, KW_FILTER, { k: 'miss', label: '問卷未填寫', type: 'checks', opts: ['過勞量表', '過負荷評估'] }])}
    <div class="toolbar"><button class="btn sm primary" data-act="wlSend">問卷發送</button><button class="btn sm" data-act="wlRemind">未填寫通知</button><button class="btn sm" data-act="proto" data-what="匯入">匯入</button><button class="btn sm" data-act="proto" data-what="環境異常調整">環境異常調整</button><button class="btn sm" data-act="proto" data-what="問卷結果匯入">問卷結果匯入</button><button class="btn sm" data-act="proto" data-what="上傳狀態查詢">上傳狀態查詢</button><button class="btn sm" data-act="wlRecalc">重算風險等級</button><span class="sp"></span><button class="btn sm" data-act="exportWl">匯出</button></div>
    ${tbl([
      { h: '評估日期', cls: 'nowrap', f: a => fmtD(a.date) },
      { h: '員工', f: a => empCell(emp(a.empId)) },
      { h: '過負荷評估', cls: 'nowrap', f: a => fill(a, 'm1', 'fillOverload', 'overloadAt') },
      { h: '過勞量表', cls: 'nowrap', f: a => fill(a, 'pf', 'fillCbi', 'fatigueAt') },
      { h: '十年心血管風險', cls: 'num', f: a => { const w = evalWorkload(a); return w.cvd ? `${w.cvd.risk}%` : '—'; } },
      { h: '工作負荷等級', f: a => loadPill(evalWorkload(a).load?.level) },
      { h: '職業促發腦心血管疾病風險等級', f: a => { const w = evalWorkload(a); return w.complete ? riskPill(w.riskLevel) : '<span class="faint">問卷未完成</span>'; } },
      { h: '面談建議', f: a => { const w = evalWorkload(a); return w.complete ? pill(w.advice, ['', 'warn', 'bad'][w.riskLevel]) : '—'; } },
      { h: '措施建議', f: a => { const w = evalWorkload(a); return w.complete ? esc(w.shortM) : '—'; } },
      { h: '個人風險評估', f: a => `<button class="btn sm" data-act="openRisk" data-id="${a.id}">檢視</button>` },
    ], rows)}</div>`;
}
ACT.wlSend = () => openDispatch('wl');
ACT.wlRemind = () => {
  const list = wlRows().filter(a => a.pf == null || a.m1 == null);
  if (!list.length) return toast('目前篩選結果中沒有未填寫的問卷', 'info');
  commit(`已寄出 ${list.length} 封催填通知（過勞量表／過負荷評估）`);
};
ACT.wlRecalc = () => { const n = S.workload.filter(a => evalWorkload(a).complete).length; commit(`已依最新健檢資料與分級規則重算 ${n} 筆風險等級`); };
ACT.exportWl = () => exportCsv('異常工作負荷評估', [
  { h: '評估日期', v: a => a.date }, { h: '帳號', v: a => a.empId }, { h: '姓名', v: a => emp(a.empId).name }, { h: '部門', v: a => deptName(emp(a.empId).dept) },
  { h: '個人相關過勞', v: a => a.pf ?? '' }, { h: '工作相關過勞', v: a => a.wf ?? '' }, { h: '近1月加班', v: a => a.m1 ?? '' }, { h: '十年心血管風險%', v: a => evalWorkload(a).cvd?.risk ?? '' },
  { h: '工作負荷等級', v: a => evalWorkload(a).load?.level ?? '' }, { h: '風險等級', v: a => evalWorkload(a).riskLevel ?? '' }, { h: '面談建議', v: a => evalWorkload(a).advice || '' },
], wlRows());

function riskDetailHtml(a) {
  const w = evalWorkload(a);
  const cv = w.cvd, ld = w.load;
  const bandTxt = ['低（<10%）', '中（10–20%）', '高（≥20%）'];
  const cvBox = cv ? `<div class="rbox"><h3>個人風險因子（參考 ${fmtD(cv.reportDate)} 健檢）</h3>${tbl([{ h: '項目', f: i => esc(i.name) }, { h: '值', f: i => esc(i.value) }, { h: '分數', cls: 'num', f: i => i.pts }], cv.items)}
      <div class="rfoot"><span>心血管評估總分 <b class="mono">${cv.total}</b> 分</span><span>十年內發生缺血性心臟病機率 <b class="mono">${cv.risk}%</b></span>${pill(bandTxt[cv.band], ['ok', 'warn', 'bad'][cv.band])}</div>
      <div class="rfoot muted">其他健檢項：${Object.entries(cv.extra).map(([k, v]) => `${k} ${esc(v)}`).join('；')}</div></div>`
    : '<div class="rbox"><h3>個人風險因子</h3><div class="empty">缺少健檢資料，無法計算心血管風險</div></div>';
  const missing = [a.pf == null && '過勞量表', a.m1 == null && '過負荷評估'].filter(Boolean).join('、');
  const ldBox = ld ? `<div class="rbox"><h3>過負荷量表與工時風險程度</h3>${tbl([{ h: '項目', f: i => esc(i.name) }, { h: '值', f: i => esc(i.value) }, { h: '負荷等級', f: i => loadPill(i.lv) }], ld.items)}
      <div class="rfoot"><span>工作負荷等級（取最高者）</span>${loadPill(ld.level)}</div>${a.patterns.length ? `<div class="rfoot muted">工作型態：${esc(a.patterns.join('、'))}</div>` : ''}</div>`
    : `<div class="rbox"><h3>過負荷量表與工時風險程度</h3><div class="empty">${missing}尚未填寫</div></div>`;
  const mx = w.complete ? `<div class="rbox"><h3>風險矩陣（十年風險 × 工作負荷）</h3><div class="mx"><div class="h"></div>${LOAD_LABEL.map(l => `<div class="h">${l}</div>`).join('')}
      ${bandTxt.map((r, i) => `<div class="h" style="text-align:right">${r}</div>${[0, 1, 2].map(j => `<div class="c${MATRIX[i][j]} ${i === cv.band && j === ld.level ? 'on' : ''}">${MATRIX[i][j]}：${RISK_LABEL[MATRIX[i][j]].slice(0, 2)}</div>`).join('')}`).join('')}</div></div>` : '';
  const res = w.complete ? `<dl class="result"><div><dt class="muted">十年內心血管疾病風險</dt><dd class="mono">${cv.risk}%</dd></div><div><dt class="muted">工作負荷等級</dt><dd>${loadPill(ld.level)}</dd></div>
      <div><dt class="muted">職業促發腦心血管疾病風險等級</dt><dd>${riskPill(w.riskLevel)}</dd></div><div><dt class="muted">安排醫師面談</dt><dd>${pill(w.advice, ['', 'warn', 'bad'][w.riskLevel])}</dd></div>
      <div class="full"><dt class="muted">健康管理措施</dt><dd>${esc(w.longM)}</dd></div></dl>` : `<div class="callout warn" style="margin-top:14px"><b>無法判定風險等級：</b>${missing || '缺少健檢資料'}尚未完成。</div>`;
  return `<div class="rgrid">${cvBox}${ldBox}${mx}</div>${res}<p class="hint">十年心血管風險以 Framingham 點數法簡化示意；正式版依「異常工作負荷促發疾病預防指引」附表校正。</p>`;
}
function openRisk(aid) {
  const a = S.workload.find(x => x.id === aid);
  const e = emp(a.empId);
  const w = evalWorkload(a);
  const m = openModal({
    title: `個人風險等級評估 · ${e.name}`, size: 'lg',
    body: `<dl class="kvgrid" style="margin-bottom:14px"><div><dt>評估日期</dt><dd>${fmtD(a.date)}</dd></div><div><dt>員工</dt><dd>${esc(e.name)}（${e.id}）</dd></div><div><dt>廠區／部門</dt><dd>${esc(siteName(e.site))}／${esc(deptName(e.dept))}</dd></div><div><dt>性別／職稱</dt><dd>${e.sex}／${esc(e.title)}</dd></div>
      <div><dt>過負荷評估填寫</dt><dd>${fmtD(a.overloadAt) || '未填寫'}</dd></div><div><dt>過勞量表填寫</dt><dd>${fmtD(a.fatigueAt) || '未填寫'}</dd></div></dl>${riskDetailHtml(a)}`,
    foot: `<button class="btn ghost" data-act="closeModal">返回</button>${w.complete && w.riskLevel >= 1 ? `<button class="btn primary" data-act="riskToIv" data-id="${a.id}">${a.interview?.status === '已面談' ? '檢視面談紀錄' : '安排醫師面談'}</button>` : ''}`,
  });
  m.ctx.id = aid;
}
ACT.openRisk = el => openRisk(el.dataset.id);
ACT.riskToIv = el => { while (MODALS.length) closeModal(); UI.tab.workload = 'interview'; go('workload'); openInterview(el.dataset.id); };

ACT.fillCbi = el => {
  const a = S.workload.find(x => x.id === el.dataset.id);
  const ans = a.cbi || { p: Array(6).fill(-1), w: Array(7).fill(-1) };
  const row = (q, name, opts, val) => `<tr><td>${esc(q)}</td>${opts.map((o, i) => `<td><label class="chk"><input type="radio" name="${name}" value="${i}" ${val === i ? 'checked' : ''} data-change="cbiCalc"><span>${esc(o)}</span></label></td>`).join('')}</tr>`;
  const m = openModal({
    title: `過勞量表 · ${emp(a.empId).name}`, size: 'lg',
    body: `<form>${a.pf != null && !a.cbi ? `<p class="mctx">目前分數為匯入結果（個人 ${a.pf}、工作 ${a.wf}），重新作答會覆蓋。</p>` : '<p class="mctx">職護代填：依員工口述勾選</p>'}
      <div class="fsec" style="margin-top:0"><h3>一、個人相關過勞</h3><div class="tbl-wrap"><table class="tbl form cbi"><tbody>${CBI.personal.map((q, i) => row(q, 'p' + i, CBI.freq, ans.p[i])).join('')}</tbody></table></div></div>
      <div class="fsec"><h3>二、工作相關過勞</h3><div class="tbl-wrap"><table class="tbl form cbi"><tbody>${CBI.work.map((q, i) => row(q.q, 'w' + i, CBI[q.s], ans.w[i])).join('')}</tbody></table></div></div>
      <div class="callout" id="cbiScore" style="margin-top:14px">已作答 0／13 題</div></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveCbi">儲存</button>`,
  });
  m.ctx.id = a.id;
  ACT.cbiCalc();
};
function readCbi(o) { return { p: CBI.personal.map((_, i) => o['p' + i] === '' || o['p' + i] == null ? -1 : +o['p' + i]), w: CBI.work.map((_, i) => o['w' + i] === '' || o['w' + i] == null ? -1 : +o['w' + i]) }; }
ACT.cbiCalc = () => {
  const ans = readCbi(formObj(curForm()));
  const n = [...ans.p, ...ans.w].filter(x => x >= 0).length;
  const box = topModal().querySelector('#cbiScore');
  if (n < 13) { box.textContent = `已作答 ${n}／13 題`; return; }
  const s = cbiScores(ans);
  box.innerHTML = `<b>個人相關過勞 ${s.pf} 分</b>（${s.pf > 70 ? '嚴重' : s.pf >= 50 ? '中度' : '輕微'}）　<b>工作相關過勞 ${s.wf} 分</b>（${s.wf > 60 ? '嚴重' : s.wf >= 45 ? '中度' : '輕微'}）`;
};
ACT.saveCbi = () => {
  const a = S.workload.find(x => x.id === topModal().ctx.id);
  const ans = readCbi(formObj(curForm()));
  if ([...ans.p, ...ans.w].some(x => x < 0)) return toast('請完成全部 13 題', 'warn');
  Object.assign(a, cbiScores(ans), { cbi: ans, fatigueAt: TODAY, cbiBy: 'nurse' });
  closeModal(); commit(`已儲存過勞量表：個人 ${a.pf} 分、工作 ${a.wf} 分`);
};
ACT.fillOverload = el => {
  const a = S.workload.find(x => x.id === el.dataset.id);
  const m = openModal({
    title: `過負荷評估 · ${emp(a.empId).name}`,
    body: `<form><div class="fgrid">${fld('近 1 個月加班時數', `<input type="number" name="m1" min="0" value="${a.m1 ?? ''}">`, { req: 1 })}${fld('近 2–6 個月平均加班時數', `<input type="number" name="avg6" min="0" value="${a.avg6 ?? ''}">`, { req: 1 })}</div>
      <div class="fsec"><h3>工作型態（可複選）</h3>${chks('patterns', WORK_PATTERNS, a.patterns, 'col')}</div>
      <p class="hint">加班判定：近 1 個月 >100 小時或 2–6 個月平均 >80 小時為高負荷；任一 ≥45 小時為中負荷。工作型態 2–3 項為中負荷，4 項以上為高負荷。</p></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveOverload">儲存</button>`,
  });
  m.ctx.id = a.id;
};
ACT.saveOverload = () => {
  const a = S.workload.find(x => x.id === topModal().ctx.id);
  const o = formObj(curForm());
  if (o.m1 === '' || o.avg6 === '') return toast('請填寫加班時數', 'warn');
  Object.assign(a, { m1: +o.m1, avg6: +o.avg6, patterns: o.patterns, overloadAt: TODAY, olBy: 'nurse' });
  closeModal(); commit('已儲存過負荷評估');
};

function ivRows() {
  const f = fval('iv');
  return S.workload.filter(a => { const w = evalWorkload(a); return (w.complete && w.riskLevel >= 1) || a.interview; })
    .filter(a => { const e = emp(a.empId); const st = a.interview?.status === '已面談' ? '已面談' : '未面談'; return orgMatch(e, f) && kwMatch(e, f.kw) && (!f.st || st === f.st) && (!f.advice || evalWorkload(a).advice === f.advice); })
    .sort((a, b) => (evalWorkload(b).riskLevel ?? 0) - (evalWorkload(a).riskLevel ?? 0));
}
function wlInterviews() {
  return `<div class="panel">${filterForm('iv', [...ORG_FILTERS, { k: 'advice', label: '面談建議', type: 'select', opts: ['建議面談', '需面談'] }, { k: 'st', label: '面談狀態', type: 'select', opts: ['未面談', '已面談'] }, KW_FILTER])}
    ${tbl([
      { h: '評估日期', cls: 'nowrap', f: a => fmtD(a.date) },
      { h: '員工', f: a => empCell(emp(a.empId)) },
      { h: '職業促發腦心血管疾病風險等級', f: a => riskPill(evalWorkload(a).riskLevel) },
      { h: '面談建議', f: a => esc(evalWorkload(a).advice || '—') },
      { h: '面談狀態', f: a => a.interview?.status === '已面談' ? pill('已面談', 'ok') : pill('未面談', 'warn') },
      { h: '面談日期', cls: 'nowrap', f: a => a.interview?.status === '已面談' ? fmtD(a.interview.date) : '—' },
      { h: '面談醫師', f: a => a.interview?.status === '已面談' ? esc(staffName(a.interview.doctor)) : '—' },
      { h: 'Email 簽送', f: a => a.interview?.signSent ? fmtD(a.interview.signSent) : '—' },
      { h: '面談結果及處理措施', f: a => `<button class="btn sm ${a.interview ? '' : 'primary'}" data-act="openInterview" data-id="${a.id}">${a.interview ? '編輯' : '填寫'}</button>` },
    ], ivRows(), { empty: '目前沒有需要面談的員工' })}</div>`;
}
ACT.openInterview = el => openInterview(el.dataset.id);
function openInterview(aid) {
  const a = S.workload.find(x => x.id === aid);
  const e = emp(a.empId);
  const w = evalWorkload(a);
  const v = a.interview || { date: TODAY, doctor: 'U3', fatigue: '', mind: '', diag: '', guide: '', work: '', special: '', needMeasure: '', adjustHours: '', changeWork: '', period: '', nextInterview: '', nextDate: '', seeDoctor: '', note: '', measureDoctor: 'U3', measureDate: TODAY };
  const r = (label, name, opts) => fld(label, `<div class="chks">${radios(name, opts, v[name])}</div>`, { cls: 'full' });
  const m = openModal({
    title: `面談結果及處理措施 · ${e.name}`, size: 'lg', side: phrasePanel(['健康諮詢', '處理狀況']),
    body: `<form><p class="mctx">${esc(e.name)}（${e.id}）· ${esc(deptName(e.dept))} · ${w.complete ? `${RISK_LABEL[w.riskLevel]}，${w.advice}` : '風險等級未判定'}</p>
      <dl class="kvgrid"><div><dt>評估日期</dt><dd>${fmtD(a.date)}</dd></div><div><dt>法人／公司</dt><dd>${esc(entName(e.entity))}</dd></div><div><dt>廠／院區</dt><dd>${esc(siteName(e.site))}</dd></div><div><dt>性別／職稱</dt><dd>${e.sex}／${esc(e.title)}</dd></div></dl>
      <div class="fsec"><h3>面談指導結果</h3><div class="fgrid">
        ${r('疲勞累積狀況', 'fatigue', ['無', '輕度', '中度', '重度'])}${r('應顧慮身心狀況', 'mind', ['有', '無'])}
        ${r('診斷區分', 'diag', ['無異常', '需觀察或進一步追蹤檢查', '需進行醫療'])}${r('指導區分', 'guide', ['不需指導', '需健康指導', '需醫療指導'])}
        ${r('工作區分', 'work', ['一般工作', '工作限制', '需休假'])}
        ${fld('特殊記載事項', txt('special', v.special, 3, 'data-ph'), { cls: 'full' })}
        ${fld('面談醫師', sel('doctor', docs(v.doctor), v.doctor))}${fld('面談指導日期', dateInp('date', v.date), { req: 1 })}
        ${fld('是否需採取措施', `<div class="chks">${radios('needMeasure', ['是', '否'], v.needMeasure)}</div>`)}</div></div>
      <div class="fsec"><h3>採取措施建議</h3><div class="fgrid">
        ${fld('調整或縮短工作時間', sel('adjustHours', ['', '縮短工時', '限制加班', '禁止加班', '調整上下班時間'], v.adjustHours))}
        ${fld('變更工作', sel('changeWork', ['', '調整為常日班', '變更作業內容', '變更工作場所', '暫停出差'], v.changeWork))}
        ${fld('措施期間', inp('period', v.period, 'placeholder="例如 3 個月"'))}
        ${fld('是否安排下次面談', `<div class="chks">${radios('nextInterview', ['是', '否'], v.nextInterview)}</div>`)}
        ${fld('下次面談預定日期', dateInp('nextDate', v.nextDate))}${fld('建議就醫', inp('seeDoctor', v.seeDoctor, 'placeholder="例如 心臟內科"'))}
        ${fld('備註', txt('note', v.note, 2), { cls: 'full' })}
        ${fld('措施建議醫師', sel('measureDoctor', docs(v.measureDoctor), v.measureDoctor))}${fld('措施建議日期', dateInp('measureDate', v.measureDate))}</div></div></form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="openRisk" data-id="${a.id}">個人風險評估結果</button><button class="btn ghost" data-act="proto" data-what="列印面談結果及採行措施表（正式版輸出 PDF）">列印面談結果及採行措施表</button></div>
      <button class="btn ghost" data-act="closeModal">取消</button><button class="btn" data-act="saveInterview" data-send="1">Email 簽送</button><button class="btn primary" data-act="saveInterview">儲存</button>`,
  });
  m.ctx.id = aid;
}
ACT.saveInterview = el => {
  const a = S.workload.find(x => x.id === topModal().ctx.id);
  const o = formObj(curForm());
  if (!o.date || !o.fatigue || !o.diag || !o.work) return toast('請填寫面談指導日期、疲勞累積狀況、診斷區分與工作區分', 'warn');
  a.interview = { ...a.interview, ...o, status: '已面談', signSent: el.dataset.send ? TODAY : a.interview?.signSent || null };
  const c = ensureCase(a.empId);
  c.status = '處理中';
  setEventStatus(a.empId, '處理中', ['未開單', '起單']);
  closeModal();
  commit(el.dataset.send ? '已儲存面談結果，並 Email 簽送給員工與主管' : '已儲存面談結果');
};
function wlLog() {
  const batches = {};
  for (const a of S.workload) (batches[a.date] ||= []).push(a);
  const rows = Object.entries(batches).sort((a, b) => b[0].localeCompare(a[0])).map(([d, list]) => {
    const ws = list.map(evalWorkload);
    const done = ws.filter(w => w.complete);
    return { d, n: list.length, done: done.length, hi: done.filter(w => w.riskLevel === 2).length, mid: done.filter(w => w.riskLevel === 1).length, lo: done.filter(w => w.riskLevel === 0).length, iv: list.filter(a => a.interview?.status === '已面談').length, measure: list.filter(a => a.interview?.needMeasure === '是').length };
  });
  const all = S.workload.map(evalWorkload).filter(w => w.complete);
  return `<div class="panel"><div class="phd"><h3>風險等級分布（全部已完成評估）</h3></div><div class="pbody">${stackBar([{ label: '低度風險', value: all.filter(w => w.riskLevel === 0).length, color: 'ok' }, { label: '中度風險', value: all.filter(w => w.riskLevel === 1).length, color: 'warn' }, { label: '高度風險', value: all.filter(w => w.riskLevel === 2).length, color: 'bad' }])}</div>
    ${tbl([{ h: '評估日期', f: r => fmtD(r.d) }, { h: '發送人數', cls: 'num', f: r => r.n }, { h: '完成評估', cls: 'num', f: r => `${r.done}（${Math.round(r.done / r.n * 100)}%）` }, { h: '高度風險', cls: 'num', f: r => r.hi }, { h: '中度風險', cls: 'num', f: r => r.mid }, { h: '低度風險', cls: 'num', f: r => r.lo }, { h: '已完成面談', cls: 'num', f: r => r.iv }, { h: '採取措施人數', cls: 'num', f: r => r.measure }], rows)}</div>`;
}

/* ====================================================================
   MATERNAL HEALTH PROTECTION (母性健康保護)
   ==================================================================== */
VIEWS.maternal = {
  title: () => '工作場所母性健康保護計畫',
  render() {
    const t = curTab('maternal', 'personal');
    const body = { env: matEnvList, personal: matPersonal, log: matLog }[t]();
    return `<div class="page-head"><div><h1>工作場所母性健康保護計畫</h1><p class="sub">作業環境危害辨識與分級、妊娠及產後一年內員工的通報、評估、面談與工作適性安排，面談紀錄以 Email 請員工確認。</p></div></div>
      ${tabs('maternal', [['env', '環境危害辨識'], ['personal', '個人評估'], ['log', '執行紀錄表']])}${body}`;
  },
};
function matEnvList() {
  const f = fval('matEnv');
  const rows = S.matEnv.filter(r => inRange(r.date, f, 'd') && (!f.site || r.site === f.site) && (!f.result || r.result === f.result) && (!f.area || r.area.includes(f.area))).sort((a, b) => b.date.localeCompare(a.date));
  const who = (r, role) => esc(r.signers.find(s => s.role === role)?.name || '—');
  return `<div class="panel">${filterForm('matEnv', [{ k: 'd', label: '評估日期', type: 'date2' }, ORG_FILTERS[0], { k: 'area', label: '評估區域' }, { k: 'result', label: '評估結果', type: 'select', opts: MAT_LEVELS }])}
    <div class="toolbar"><button class="btn sm primary" data-act="matEnvEdit">＋ 新增</button><button class="btn sm" data-act="proto" data-what="匯入">匯入</button><button class="btn sm" data-act="proto" data-what="範本下載">範本下載</button><button class="btn sm" data-act="go" data-to="org">廠區／法人代碼表</button></div>
    ${tbl([
      { h: '評估日期', cls: 'nowrap', f: r => fmtD(r.date) }, { h: '法人', f: r => esc(entName(r.entity)) }, { h: '廠區', f: r => esc(siteName(r.site)) }, { h: '部門', f: r => esc(deptName(r.dept)) },
      { h: '評估區域', f: r => esc(r.area) }, { h: '職業安全衛生人員', f: r => who(r, '職業安全衛生人員') }, { h: '勞工健康服務醫師', f: r => who(r, '勞工健康服務醫師') }, { h: '勞工健康服務護理人員', f: r => who(r, '勞工健康服務護理人員') },
      { h: '評估結果', f: r => pill(r.result, levelPill(r.result)) }, { h: '簽核', f: r => signSummary(r) },
      { h: '', f: r => `<button class="btn sm" data-act="matEnvEdit" data-id="${r.id}">編輯</button>` },
    ], rows)}</div>`;
}
ACT.matEnvEdit = el => {
  const r = el.dataset.id ? S.matEnv.find(x => x.id === el.dataset.id) : null;
  const v = r || { date: TODAY, entity: 'L1', site: 'S1', dept: '', area: '', shiftType: '常日班', hazards: Object.fromEntries(MAT_HAZARDS.map(h => [h, { v: '無', note: '' }])), result: '', attach: '', signers: [{ role: '職業安全衛生人員', name: '陳立民', email: 'safety.chen@example.com' }, { role: '勞工健康服務醫師', name: '吳建宏', email: 'dr.wu@example.com' }, { role: '勞工健康服務護理人員', name: staffName(ME), email: staff(ME).email }] };
  const m = openModal({
    title: r ? '環境危害辨識' : '新增環境危害辨識', size: 'lg', side: phrasePanel(['母性－物理性危害', '母性－化學性危害']),
    body: `<form><div class="fgrid">${fld('評估日期', dateInp('date', v.date), { req: 1 })}${fld('法人／公司', sel('entity', ORG.entities.map(x => [x.id, x.name]), v.entity), { req: 1 })}${fld('廠／院區', sel('site', SITE_OPTS, v.site))}${fld('部門', sel('dept', deptOptsFor(''), v.dept))}
        ${fld('評估區域', inp('area', v.area, 'placeholder="建物名稱、樓別"'), { req: 1, cls: 'w2' })}${fld('上傳附件', '<input type="file" name="attach">')}${v.attach ? `<div class="hint">已上傳：${esc(v.attach)}</div>` : ''}</div>
      <div class="fsec"><h3>作業場所危害評估及母性健康保護採行措施表 <span style="font-weight:400">${sel('formLang', LANGS, 'zh', 'aria-label="表單語系" style="width:auto" data-change="formLang"')}</span></h3>
        <div class="fgrid">${fld('一、作業場所基本資料：部門名稱', `<input value="${esc(deptName(v.dept) || '（未指定）')}" readonly>`)}${fld('作業型態', `<div class="chks">${radios('shiftType', ['常日班', '輪班', '其他'], v.shiftType)}</div>`)}</div></div>
      <div class="fsec"><h3>二、危害辨識</h3><div class="tbl-wrap"><table class="tbl form"><thead><tr><th>危害類別</th><th>判定</th><th>說明（可帶入片語）</th></tr></thead><tbody>
        ${MAT_HAZARDS.map((h, i) => `<tr><td class="nowrap">${h}</td><td><div class="chks">${radios('hz_' + i, ['有', '無', '可能有影響'], v.hazards[h]?.v || '無', 'data-change="matSug"')}</div></td><td>${txt('hzn_' + i, v.hazards[h]?.note || '', 2, `aria-label="${h}說明"`)}</td></tr>`).join('')}</tbody></table></div></div>
      <div class="fsec"><h3>三、評估結果</h3><div class="chks">${radios('result', MAT_LEVELS, v.result || matSuggest(v.hazards))}</div><p class="hint" id="matSug">依危害判定建議：${matSuggest(v.hazards)}（有危害 → 第三級；可能有影響 → 第二級；皆無 → 第一級）</p></div>
      <div class="fsec"><h3>四、簽核人員</h3>${signersEditor(v.signers)}</div></form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="signLog" data-coll="matEnv" data-id="${r?.id || ''}">確認紀錄查詢</button>${printBtns}</div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn" data-act="saveMatEnv" data-send="1">Email 發送</button><button class="btn primary" data-act="saveMatEnv">確定</button>`,
  });
  m.ctx.id = r?.id;
};
ACT.formLang = el => { if (el.value !== 'zh') toast('表單多語系：雛形僅提供中文內容，正式版依語系切換', 'info'); };
ACT.matSug = () => {
  const o = formObj(curForm());
  const hz = Object.fromEntries(MAT_HAZARDS.map((h, i) => [h, { v: o['hz_' + i] }]));
  topModal().querySelector('#matSug').textContent = `依危害判定建議：${matSuggest(hz)}（有危害 → 第三級；可能有影響 → 第二級；皆無 → 第一級）`;
};
ACT.saveMatEnv = el => {
  const f = curForm();
  const o = formObj(f);
  const x = topModal().ctx;
  if (!o.date || !o.area) return toast('請填寫評估日期與評估區域', 'warn');
  if (o.dept && deptOf(o.dept).site !== o.site) return toast('所選部門不屬於此廠區', 'warn');
  let r = x.id ? S.matEnv.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('ME'), signers: [], attach: '' }; S.matEnv.unshift(r); }
  const hazards = Object.fromEntries(MAT_HAZARDS.map((h, i) => [h, { v: o['hz_' + i] || '無', note: o['hzn_' + i] }]));
  Object.assign(r, { date: o.date, entity: o.entity, site: o.site, dept: o.dept, area: o.area, shiftType: o.shiftType, hazards, result: o.result || matSuggest(hazards), signers: readSigners(o, r.signers), attach: fileNames(f)[0] || r.attach });
  const n = el.dataset.send ? sendSign(r) : 0;
  closeModal();
  commit(el.dataset.send ? `已儲存並寄出 ${n} 封簽核通知` : '已儲存環境危害辨識');
};

function matPersonal() {
  const f = fval('mat');
  const rows = S.matCases.filter(m => { const e = emp(m.empId); return inRange(m.notifyDate, f, 'd') && (!f.type || m.type === f.type) && (!f.st || m.status === f.st) && kwMatch(e, f.kw); }).sort((a, b) => b.notifyDate.localeCompare(a.notifyDate));
  return `<div class="panel">${filterForm('mat', [{ k: 'd', label: '通報日期', type: 'date2' }, { k: 'type', label: '通報類型', type: 'select', opts: ['妊娠', '產後一年內'] }, { k: 'st', label: '處理狀態', type: 'select', opts: ['已通報', '已面談', '待員工確認', '已確認'] }, KW_FILTER])}
    <div class="toolbar"><button class="btn sm primary" data-act="newMat">＋ 新增通報</button><button class="btn sm" data-act="proto" data-what="匯入">匯入</button><button class="btn sm" data-act="proto" data-what="範本下載">範本下載</button></div>
    ${tbl([
      { h: '通報日期', cls: 'nowrap', f: m => fmtD(m.notifyDate) }, { h: '通報類型', f: m => pill(m.type, m.type === '妊娠' ? 'acc' : 'info') }, { h: '員工', f: m => empCell(emp(m.empId)) },
      { h: '預產期／分娩日', cls: 'nowrap', f: m => fmtD(m.type === '妊娠' ? m.due : m.birthDate) }, { h: '目前懷孕週數', f: m => pregWeeks(m) || '—' },
      { h: '作業環境', f: m => m.env.level ? pill(m.env.level, levelPill(m.env.level)) : '<span class="faint">未評估</span>' },
      { h: '面談', cls: 'nowrap', f: m => m.interview?.date ? fmtD(m.interview.date) : '<span class="faint">未面談</span>' },
      { h: '員工確認', f: m => pill(m.status, m.status === '已確認' ? 'ok' : m.status === '待員工確認' ? 'warn' : '') + (m.confirmAt ? `<span class="sub2">${fmtD(m.confirmAt)}</span>` : '') },
      { h: '', f: m => `<button class="btn sm primary" data-act="openMat" data-id="${m.id}">開啟</button>` },
    ], rows)}</div>`;
}
ACT.newMat = el => {
  const women = S.employees.filter(e => e.sex === '女' && e.status === '在職' && !S.matCases.some(m => m.empId === e.id && m.status !== '已確認'));
  const pre = el.dataset.emp || '';
  const m = openModal({
    title: '新增妊娠或產後一年通報資料', size: 'lg',
    body: `<form><div class="fgrid">${fld('通報日期', dateInp('notifyDate', TODAY), { req: 1 })}${fld('通報類型', sel('type', [['', '選擇'], '妊娠', '產後一年內']), { req: 1 })}
      ${fld('員工帳號／姓名', sel('empId', [['', '選擇員工'], ...women.map(e => [e.id, `${e.id}_${e.name}`])], pre, 'data-change="matEmpPick"'), { req: 1 })}${fld('目前班別', inp('shift', ''))}
      ${fld('法人／公司', inp('entityName', '', 'readonly'))}${fld('部門', inp('deptName', '', 'readonly'))}${fld('職稱', inp('title', '', 'readonly'))}${fld('年齡', inp('age', '', 'readonly'))}
      ${fld('預產期（妊娠）', dateInp('due'))}${fld('分娩日期（產後）', dateInp('birthDate'))}
      ${fld('辦公室電話', inp('tel', ''), { req: 1 })}${fld('單位主管姓名', inp('mgr', ''))}${fld('單位主管辦公室電話', inp('mgrTel', ''))}${fld('單位主管 Email', inp('mgrEmail', '', 'type="email"'))}
      ${fld('員工 Email', inp('email', '', 'type="email"'), { req: 1, cls: 'w2' })}</div><p class="hint">選擇員工後會自動帶入班別、部門、職稱、年齡與單位主管資料。</p></form>`,
    foot: `<button class="btn ghost" data-act="closeModal">取消</button><button class="btn primary" data-act="saveNewMat">確定</button>`,
  });
  if (pre) ACT.matEmpPick(m.querySelector('[name=empId]'));
};
ACT.matEmpPick = el => {
  const e = emp(el.value);
  const f = el.closest('form');
  if (!e) return;
  const d = deptOf(e.dept);
  const set = (n, v) => { f.elements[n].value = v; };
  set('shift', e.shift); set('entityName', entName(e.entity)); set('deptName', d.name); set('title', e.title); set('age', age(e.birth));
  set('mgr', d.mgr); set('mgrTel', d.mgrTel); set('mgrEmail', d.mgrEmail); set('email', e.email); set('tel', `${d.mgrTel.slice(0, -2)}${pad(10 + S.employees.indexOf(e))}`);
};
ACT.saveNewMat = () => {
  const o = formObj(curForm());
  const miss = [!o.notifyDate && '通報日期', !o.type && '通報類型', !o.empId && '員工', !o.tel && '辦公室電話', !o.email && '員工 Email'].filter(Boolean);
  if (miss.length) return toast(`請填寫：${miss.join('、')}`, 'warn');
  if (o.type === '妊娠' && !o.due) return toast('妊娠通報請填寫預產期', 'warn');
  if (o.type === '產後一年內' && !o.birthDate) return toast('產後通報請填寫分娩日期', 'warn');
  const m = { id: uid('MC'), empId: o.empId, type: o.type, notifyDate: o.notifyDate, due: o.due, birthDate: o.birthDate, shift: o.shift, tel: o.tel, mgr: o.mgr, mgrTel: o.mgrTel, mgrEmail: o.mgrEmail, email: o.email, env: { envId: '', items: [], level: '' }, self: { items: [], note: '' }, interview: null, fit: null, status: '已通報', emailAt: null, confirmAt: null, agreed: [] };
  S.matCases.unshift(m);
  closeModal(); commit('已新增通報，並產生「母性健康保護」異常事件');
  openMat(m.id);
};
ACT.openMat = el => openMat(el.dataset.id);
function openMat(id) {
  const c = S.matCases.find(x => x.id === id);
  const e = emp(c.empId);
  const iv = c.interview || { date: '', by: ME, envLevel: c.env.level || '', health: '', measures: [], measureNote: '', edu: '', proposed: [] };
  const fit = c.fit || { doctor: 'U3', advice: '', limits: [], from: '', to: '', note: '' };
  const envOpts = [['', '（未選擇）'], ...S.matEnv.map(r => [r.id, `${r.area}（${r.result}）`])];
  const sec = (k, html, on) => `<section data-sec="${k}" ${on ? '' : 'hidden'}>${html}</section>`;
  const m = openModal({
    title: `母性健康保護－個人評估 · ${e.name}`, size: 'lg', side: phrasePanel(['母性－物理性危害', '母性－化學性危害']),
    body: `<form><dl class="kvgrid"><div><dt>員工帳號／姓名</dt><dd>${e.id}_${esc(e.name)}</dd></div><div><dt>法人／公司</dt><dd>${esc(entName(e.entity))}</dd></div><div><dt>廠／院區</dt><dd>${esc(siteName(e.site))}</dd></div><div><dt>部門／職稱</dt><dd>${esc(deptName(e.dept))}／${esc(e.title)}</dd></div>
        <div><dt>年齡</dt><dd>${age(e.birth)}</dd></div><div><dt>通報</dt><dd>${esc(c.type)}（${fmtD(c.notifyDate)}）</dd></div><div><dt>${c.type === '妊娠' ? '預產期' : '分娩日期'}</dt><dd>${fmtD(c.type === '妊娠' ? c.due : c.birthDate)}</dd></div><div><dt>目前懷孕週數</dt><dd>${pregWeeks(c) || '—'}</dd></div><div><dt>目前班別</dt><dd>${esc(c.shift)}</dd></div><div><dt>員工確認</dt><dd>${pill(c.status, c.status === '已確認' ? 'ok' : c.status === '待員工確認' ? 'warn' : '')}</dd></div></dl>
      <div class="mtabs" style="margin-top:16px">${[['env', '個人環境辨識'], ['self', '自我評估'], ['iv', '面談紀錄'], ['fit', '工作適性安排建議']].map(([k, l], i) => `<button type="button" class="${i === 2 ? 'on' : ''}" data-act="mtab" data-k="${k}">${l}</button>`).join('')}</div>
      ${sec('env', `<div class="fgrid">${fld('對應之環境危害辨識', sel('envId', envOpts, c.env.envId, 'data-change="matEnvPick"'), { cls: 'w2' })}${fld('管理等級', `<div class="chks">${radios('envLevel', MAT_LEVELS, c.env.level)}</div>`, { cls: 'full' })}${fld('個人作業危害項目（可帶入片語）', txt('envItems', c.env.items.join('\n'), 4, 'data-ph'), { cls: 'full' })}</div>`)}
      ${sec('self', `<div class="fsec" style="margin-top:0"><h3>員工自我評估（員工可於員工端填寫）</h3>${chks('selfItems', MAT_SELF, c.self.items)}</div><div style="margin-top:12px">${fld('補充說明', txt('selfNote', c.self.note, 3))}</div>`)}
      ${sec('iv', `<div class="fsec" style="margin-top:0"><h3>三、工作環境危害及健康問題</h3><div class="fgrid">${fld('1. 工作環境危害（參閱附表一）', `<div class="chks">${radios('ivEnv', MAT_LEVELS, iv.envLevel)}</div>`, { cls: 'full' })}${fld('2. 健康問題（保護期間可參考附表二）', `<div class="chks">${radios('health', ['無，大致正常', '有，採取第四項措施'], iv.health)}</div>`, { cls: 'full' })}</div></div>
        <div class="fsec"><h3>四、採取措施</h3>${chks('measures', MAT_MEASURES, iv.measures, 'col')}<div style="margin-top:8px">${fld('其他說明', inp('measureNote', iv.measureNote))}</div>
          <div style="margin-top:12px">${fld('衛教指導', `<div class="chks col">${radios('edu', MAT_EDU, iv.edu)}</div>`)}</div></div>
        <div class="fsec"><h3>面談資訊</h3><div class="fgrid">${fld('面談日期', dateInp('ivDate', iv.date || TODAY), { req: 1 })}${fld('面談之醫師或護理人員', sel('ivBy', docs(iv.by), iv.by))}${fld('建議員工接受之事項', chks('proposed', MAT_AGREE, iv.proposed), { cls: 'full' })}</div>
          ${c.status === '已確認' ? `<div class="callout"><b>員工已確認（${fmtD(c.confirmAt)}）</b>：同意接受 ${esc(c.agreed.join('、'))}</div>` : c.status === '待員工確認' ? `<div class="callout warn"><b>待員工確認</b>：確認信已於 ${fmtD(c.emailAt)} 寄出。<button type="button" class="btn link" data-act="portalMat" data-id="${c.id}">以員工身分開啟</button></div>` : ''}</div>`, true)}
      ${sec('fit', `<div class="fgrid">${fld('評估醫師', sel('fitDoctor', docs(fit.doctor), fit.doctor))}${fld('工作適性安排建議', `<div class="chks col">${radios('advice', FIT_ADVICE, fit.advice)}</div>`, { cls: 'full' })}${fld('條件限制', chks('limits', FIT_LIMITS, fit.limits), { cls: 'full' })}${fld('建議期間（起）', dateInp('fitFrom', fit.from))}${fld('建議期間（迄）', dateInp('fitTo', fit.to))}${fld('說明', txt('fitNote', fit.note, 3), { cls: 'full' })}</div>`)}
    </form>`,
    foot: `<button class="btn ghost" data-act="closeModal">返回</button><button class="btn" data-act="saveMat" data-send="1">發送員工 Email 確認</button><button class="btn primary" data-act="saveMat">儲存</button>`,
  });
  m.ctx.id = id;
}
ACT.mtab = el => {
  const m = topModal();
  m.querySelectorAll('.mtabs button').forEach(b => b.classList.toggle('on', b === el));
  m.querySelectorAll('[data-sec]').forEach(s => { s.hidden = s.dataset.sec !== el.dataset.k; });
};
ACT.matEnvPick = el => {
  const r = S.matEnv.find(x => x.id === el.value);
  if (!r) return;
  const f = el.closest('form');
  f.querySelectorAll('[name=envLevel]').forEach(x => { x.checked = x.value === r.result; });
  const items = Object.entries(r.hazards).filter(([, h]) => h.v !== '無').map(([k, h]) => `${k}：${h.note || h.v}`);
  if (!f.elements.envItems.value) f.elements.envItems.value = items.join('\n');
};
ACT.saveMat = el => {
  const c = S.matCases.find(x => x.id === topModal().ctx.id);
  const o = formObj(curForm());
  const send = !!el.dataset.send;
  if (send && (!o.ivEnv || !o.health || !o.ivDate)) return toast('發送確認前，請完成面談紀錄的工作環境危害、健康問題與面談日期', 'warn');
  c.env = { envId: o.envId, items: o.envItems.split('\n').map(s => s.trim()).filter(Boolean), level: o.envLevel };
  c.self = { items: o.selfItems, note: o.selfNote };
  const hasIv = o.ivEnv || o.health || o.measures.length;
  if (hasIv) c.interview = { date: o.ivDate, by: o.ivBy, envLevel: o.ivEnv, health: o.health, measures: o.measures, measureNote: o.measureNote, edu: o.edu, proposed: o.proposed };
  if (o.advice) c.fit = { doctor: o.fitDoctor, advice: o.advice, limits: o.limits, from: o.fitFrom, to: o.fitTo, note: o.fitNote };
  if (send) Object.assign(c, { status: '待員工確認', emailAt: TODAY, confirmAt: null, agreed: [] });
  else if (hasIv && c.status === '已通報') c.status = '已面談';
  const cs = ensureCase(c.empId);
  cs.status = '處理中';
  setEventStatus(c.empId, '處理中', ['未開單', '起單']);
  closeModal();
  commit(send ? '已寄出面談紀錄確認信' : '已儲存個人評估');
  if (send) showMatEmail(c);
};
function showMatEmail(c) {
  const e = emp(c.empId);
  openModal({
    title: '已寄出：母性健康保護面談記錄確認簽核',
    body: `<div class="emailbox"><div class="eh"><span>寄件者：Yutis Care 健康中心 &lt;notify@yutis-care.example&gt;</span><span>收件者：${esc(c.email)}</span><span>主旨：母性健康保護面談記錄確認簽核</span></div>
      <p>親愛的 ${esc(e.name)} 您好：</p><p>您已完成母性健康保護面談。依職業安全衛生相關規定，需要請您確認面談紀錄。請點選下方連結查看面談紀錄並完成確認；如有疑問，請洽健康中心。謝謝您的配合！</p>
      <p><button class="btn link" data-act="portalMat" data-id="${c.id}">母性健康保護面談紀錄</button>（請點此進行簽核）</p></div><p class="hint">雛形不會真的寄信。點上方連結可切換到「員工端預覽」模擬員工確認。</p>`,
    foot: `<button class="btn primary" data-act="closeModal">知道了</button>`,
  });
}
ACT.portalMat = el => { while (MODALS.length) closeModal(); const c = S.matCases.find(x => x.id === el.dataset.id); UI.portal = { emp: c.empId, item: 'mat:' + c.id }; go('portal'); };
function matLog() {
  const cs = S.matCases;
  const env = S.matEnv;
  return `<div class="panel"><div class="pbody"><div class="bigsum"><div><b>${cs.filter(c => c.type === '妊娠').length}</b><span>妊娠通報</span></div><div><b>${cs.filter(c => c.type === '產後一年內').length}</b><span>產後一年內通報</span></div><div><b>${cs.filter(c => c.interview?.date).length}</b><span>完成面談</span></div><div><b>${cs.filter(c => c.status === '待員工確認').length}</b><span>待員工確認</span></div><div><b>${cs.filter(c => c.status === '已確認').length}</b><span>員工已確認</span></div><div><b>${env.length}</b><span>已評估作業區域</span></div></div>
    <h3 style="font-size:14px;margin:6px 0 10px">作業區域管理等級</h3>${stackBar(MAT_LEVELS.map((l, i) => ({ label: l, value: env.filter(r => r.result === l).length, color: ['ok', 'warn', 'bad'][i] })))}</div>
    ${tbl([{ h: '員工', f: c => empCell(emp(c.empId)) }, { h: '通報', f: c => `${esc(c.type)}（${fmtD(c.notifyDate)}）` }, { h: '環境等級', f: c => c.env.level ? pill(c.env.level, levelPill(c.env.level)) : '—' }, { h: '採取措施', f: c => esc(c.interview?.measures.join('、') || '—') }, { h: '工作適性建議', f: c => esc(c.fit?.advice || '—') }, { h: '員工同意事項', f: c => esc(c.agreed.join('、') || '—') }], cs)}</div>`;
}

/* ====================================================================
   WORKPLACE VIOLENCE (執行職務遭受不法侵害預防)
   ==================================================================== */
VIEWS.violence = {
  title: () => '執行職務遭受不法侵害預防計畫',
  render() {
    const t = curTab('violence', 'risk');
    const body = { risk: vioRiskList, place: () => vioCheckList(['物理環境', '工作場所設計']), fit: () => vioCheckList(['適性配工', '工作設計']), incident: vioIncList, review: vioReviewList }[t]();
    return `<div class="page-head"><div><h1>執行職務遭受不法侵害預防計畫</h1><p class="sub">辨識及評估危害、適當配置作業場所、依工作適性調整人力、事件通報與處理、措施查核及評估。</p></div></div>
      ${tabs('violence', [['risk', '辨識及評估危害'], ['place', '適當配置作業場所'], ['fit', '工作適性適當調整人力'], ['incident', '事件通報與處理'], ['review', '措施查核及評估']])}${body}`;
  },
};
function vioRiskList() {
  const f = fval('vr');
  const rows = S.vioRisk.filter(r => inRange(r.date, f, 'd') && (!f.site || r.site === f.site) && (!f.place || r.place.includes(f.place))).sort((a, b) => b.date.localeCompare(a.date));
  const hi = r => Object.values(r.rows).filter(x => x.yes === '是' && vioLevel(x.lik, x.sev) === '高度風險').length;
  return `<div class="panel">${filterForm('vr', [{ k: 'd', label: '評估日期', type: 'date2' }, ORG_FILTERS[0], { k: 'place', label: '受評估場所' }])}
    <div class="toolbar"><button class="btn sm primary" data-act="vioRiskEdit">＋ 新增</button><button class="btn sm" data-act="proto" data-what="匯入">匯入</button><button class="btn sm" data-act="proto" data-what="範本下載">範本下載</button></div>
    ${tbl([{ h: '評估日期', cls: 'nowrap', f: r => fmtD(r.date) }, { h: '廠／院區', f: r => esc(siteName(r.site)) }, { h: '部門', f: r => esc(deptName(r.dept)) }, { h: '受評估場所', f: r => esc(r.place) }, { h: '場所內工作型態', f: r => esc(r.pattern) }, { h: '場所內工作人數', cls: 'num', f: r => r.headcount }, { h: '評估人員', f: r => esc(r.assessor) }, { h: '審查者', f: r => esc(r.reviewer) }, { h: '高度風險項目', f: r => hi(r) ? pill(`${hi(r)} 項`, 'bad') : pill('0 項', 'ok') }, { h: '', f: r => `<button class="btn sm" data-act="vioRiskEdit" data-id="${r.id}">編輯</button>` }], rows)}</div>`;
}
ACT.vioRiskEdit = el => {
  const r = el.dataset.id ? S.vioRisk.find(x => x.id === el.dataset.id) : null;
  const v = r || { date: TODAY, site: '', dept: '', place: '', pattern: '', headcount: '', assessor: '', reviewer: '', rows: {} };
  let g = '';
  const rows = VIO_QUESTIONS.map((q, i) => {
    const x = v.rows[i] || {};
    const head = q.g !== g ? `<tr><td colspan="9" style="background:var(--surface-2);font-weight:600">${(g = q.g)}</td></tr>` : '';
    return head + `<tr><td style="min-width:260px">${esc(q.q)}</td><td><input type="radio" name="r${i}_yes" value="是" ${x.yes === '是' ? 'checked' : ''} aria-label="是"></td><td><input type="radio" name="r${i}_yes" value="否" ${x.yes !== '是' ? 'checked' : ''} aria-label="否"></td>
      <td>${chks(`r${i}_types`, VIO_TYPES, x.types || [], 'col')}</td><td>${sel(`r${i}_lik`, [['', '—'], ...VIO_LIK], x.lik || '', `data-change="vioCalc" data-i="${i}" aria-label="可能性"`)}</td><td>${sel(`r${i}_sev`, [['', '—'], ...VIO_SEV], x.sev || '', `data-change="vioCalc" data-i="${i}" aria-label="嚴重性"`)}</td>
      <td id="vl${i}">${vioPill(vioLevel(x.lik, x.sev))}</td><td>${chks(`r${i}_ctrl`, VIO_CTRL, x.ctrl || [], 'col')}</td><td>${txt(`r${i}_add`, x.add || '', 3, 'aria-label="應增加或修正相關措施"')}</td></tr>`;
  }).join('');
  const m = openModal({
    title: r ? '辨識及評估危害' : '新增辨識及評估危害', size: 'lg',
    body: `<form><div class="fgrid">${fld('評估日期', dateInp('date', v.date), { req: 1 })}${fld('廠／院區', sel('site', [['', '選擇'], ...SITE_OPTS], v.site), { req: 1 })}${fld('部門', sel('dept', deptOptsFor(''), v.dept))}${fld('受評估場所', inp('place', v.place), { req: 1 })}
        ${fld('場所內工作型態', inp('pattern', v.pattern))}${fld('場所內工作人數', `<input type="number" name="headcount" min="0" value="${esc(v.headcount)}">`)}${fld('評估人員', inp('assessor', v.assessor))}${fld('審查者', inp('reviewer', v.reviewer))}</div>
      <div class="fsec"><h3>潛在風險評估 <span class="hint" style="margin:0;font-weight:400">風險等級 = 可能性 × 嚴重性，自動計算</span></h3><div class="tbl-wrap"><table class="tbl form matrix"><thead><tr><th>潛在風險</th><th>是</th><th>否</th><th>潛在不法侵害風險類型</th><th>可能性（發生機率）</th><th>嚴重性（傷害程度）</th><th>風險等級</th><th>現有控制措施</th><th>應增加或修正相關措施</th></tr></thead><tbody>${rows}</tbody></table></div></div></form>`,
    foot: `<div class="left">${printBtns}</div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn primary" data-act="saveVioRisk">儲存</button>`,
  });
  m.ctx.id = r?.id;
};
ACT.vioCalc = el => {
  const f = curForm();
  const i = el.dataset.i;
  topModal().querySelector('#vl' + i).innerHTML = vioPill(vioLevel(f.elements[`r${i}_lik`].value, f.elements[`r${i}_sev`].value));
};
ACT.saveVioRisk = () => {
  const o = formObj(curForm());
  if (!o.date || !o.site || !o.place) return toast('請填寫評估日期、廠區與受評估場所', 'warn');
  const x = topModal().ctx;
  let r = x.id ? S.vioRisk.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('VR') }; S.vioRisk.unshift(r); }
  Object.assign(r, { date: o.date, site: o.site, dept: o.dept, place: o.place, pattern: o.pattern, headcount: +o.headcount || 0, assessor: o.assessor, reviewer: o.reviewer,
    rows: Object.fromEntries(VIO_QUESTIONS.map((_, i) => [i, { yes: o[`r${i}_yes`], types: o[`r${i}_types`], lik: o[`r${i}_lik`], sev: o[`r${i}_sev`], ctrl: o[`r${i}_ctrl`], add: o[`r${i}_add`] }])) });
  closeModal(); commit('已儲存辨識及評估危害');
};
function vioCheckList(kinds) {
  const rows = S.vioCheck.filter(r => kinds.includes(r.kind)).sort((a, b) => b.date.localeCompare(a.date));
  const fitKind = kinds.includes('適性配工');
  return `<div class="panel"><div class="toolbar" style="border-top:0">${kinds.map(k => `<button class="btn sm primary" data-act="vioCheckEdit" data-kind="${k}">＋ ${k}檢點表</button>`).join('')}<span class="sp"></span><span class="muted">「應增加或改善之措施」「建議可採行措施」可勾選帶入預設片語</span></div>
    ${tbl([{ h: '類別', f: r => esc(r.kind) }, { h: '檢點日期', cls: 'nowrap', f: r => fmtD(r.date) }, { h: '廠／院區', f: r => esc(siteName(r.site)) }, { h: '部門', f: r => esc(deptName(r.dept)) }, { h: '處所', f: r => esc(r.place) }, { h: '作業內容', f: r => esc(r.content) },
      { h: fitKind ? '已檢點項目' : '已填寫項目', cls: 'num', f: r => `${Object.values(r.rows).filter(x => x.cur || x.imp || x.sug).length}／${VIO_FACTORS[r.kind].length}` }, { h: '', f: r => `<button class="btn sm" data-act="vioCheckEdit" data-id="${r.id}">編輯</button>` }], rows)}</div>`;
}
ACT.vioCheckEdit = el => {
  const r = el.dataset.id ? S.vioCheck.find(x => x.id === el.dataset.id) : null;
  const kind = r?.kind || el.dataset.kind;
  const v = r || { date: TODAY, site: '', dept: '', place: '', content: '', rows: {} };
  const fit = ['適性配工', '工作設計'].includes(kind);
  const m = openModal({
    title: `${r ? '' : '新增'}${kind}檢點表`, size: 'lg',
    body: `<form><div class="fgrid">${fld('檢點日期', dateInp('date', v.date), { req: 1 })}${fld('廠／院區', sel('site', [['', '選擇'], ...SITE_OPTS], v.site), { req: 1 })}${fld('部門', sel('dept', deptOptsFor(''), v.dept))}${fld('處所', inp('place', v.place), { req: 1 })}${fld('作業內容', inp('content', v.content), { cls: 'w2' })}</div>
      <div class="fsec"><h3>檢點項目</h3><div class="tbl-wrap"><table class="tbl form"><thead><tr><th>${fit ? '檢點項目' : '環境相關因子'}</th><th>${fit ? '作業內容（含預防措施之現況描述）' : '現況描述（含現有措施）'}</th>${fit ? '<th>從事作業人數</th>' : ''}<th>應增加或改善之措施</th><th>建議可採行措施</th><th>片語</th></tr></thead><tbody>
        ${VIO_FACTORS[kind].map((fct, i) => { const x = v.rows[i] || {}; return `<tr><td style="min-width:140px">${esc(fct)}</td><td>${txt(`c${i}_cur`, x.cur || '', 2, `aria-label="${esc(fct)}現況"`)}</td>${fit ? `<td><input type="number" name="c${i}_n" min="0" value="${esc(x.n ?? '')}" style="width:80px" aria-label="人數"></td>` : ''}<td>${txt(`c${i}_imp`, x.imp || '', 2, 'aria-label="應增加或改善之措施"')}</td><td>${txt(`c${i}_sug`, x.sug || '', 2, 'aria-label="建議可採行措施"')}</td><td><button type="button" class="btn sm" data-act="checkPhrase" data-i="${i}" aria-label="為${esc(fct)}帶入片語">片語</button></td></tr>`; }).join('')}
      </tbody></table></div></div></form>`,
    foot: `<div class="left">${printBtns}</div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn primary" data-act="saveVioCheck">儲存</button>`,
  });
  Object.assign(m.ctx, { id: r?.id, kind });
};
ACT.checkPhrase = el => {
  const list = S.phrases.filter(p => p.cat === '不法侵害－措施');
  const m = openModal({
    title: '措施內容片語', size: 'sm',
    body: `<form>${tbl([{ h: '措施內容', f: p => esc(p.text) }, { h: '應增加或改善', f: (p, i) => `<input type="checkbox" name="imp[]" value="${i}" ${p.kind === '改善' ? '' : ''} aria-label="應增加或改善">` }, { h: '建議可採行', f: (p, i) => `<input type="checkbox" name="sug[]" value="${i}" aria-label="建議可採行">` }], list)}</form>`,
    foot: `<button class="btn ghost" data-act="closeModal">返回</button><button class="btn primary" data-act="putPhrase">帶入</button>`,
  });
  m.ctx.i = el.dataset.i;
};
ACT.putPhrase = () => {
  const o = formObj(curForm());
  const list = S.phrases.filter(p => p.cat === '不法侵害－措施');
  const i = topModal().ctx.i;
  const parent = MODALS[MODALS.length - 2].querySelector('form');
  const add = (name, idx) => { const t = parent.elements[name]; const s = idx.map(k => list[+k].text).join('\n'); if (s) t.value = t.value ? t.value.replace(/\s*$/, '') + '\n' + s : s; };
  add(`c${i}_imp`, o.imp || []); add(`c${i}_sug`, o.sug || []);
  closeModal();
};
ACT.saveVioCheck = () => {
  const o = formObj(curForm());
  if (!o.date || !o.site || !o.place) return toast('請填寫檢點日期、廠區與處所', 'warn');
  const x = topModal().ctx;
  let r = x.id ? S.vioCheck.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('VC'), kind: x.kind }; S.vioCheck.unshift(r); }
  Object.assign(r, { date: o.date, site: o.site, dept: o.dept, place: o.place, content: o.content, rows: Object.fromEntries(VIO_FACTORS[r.kind].map((_, i) => [i, { cur: o[`c${i}_cur`], imp: o[`c${i}_imp`], sug: o[`c${i}_sug`], n: o[`c${i}_n`] }])) });
  closeModal(); commit(`已儲存${r.kind}檢點表`);
};
function vioIncList() {
  const f = fval('vi');
  const rows = S.vioIncidents.filter(r => inRange(r.date, f, 'd') && (!f.type || r.type === f.type) && (!f.site || r.site === f.site) && (!f.place || r.place.includes(f.place))).sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel">${filterForm('vi', [{ k: 'd', label: '發生日期', type: 'date2' }, { k: 'type', label: '不法侵害類型', type: 'select', opts: VIO_INC_TYPES }, ORG_FILTERS[0], { k: 'place', label: '發生地點' }])}
    <div class="toolbar"><button class="btn sm primary" data-act="vioIncEdit">＋ 新增</button></div>
    ${tbl([{ h: '法人／公司', f: r => esc(entName(r.entity)) }, { h: '廠／院區', f: r => esc(siteName(r.site)) }, { h: '發生日期', cls: 'nowrap', f: r => `${fmtD(r.date)} ${esc(r.time)}` }, { h: '不法侵害類型', f: r => pill(r.type, 'bad') }, { h: '發生地點', f: r => esc(r.place) }, { h: '受害者', f: r => `${esc(r.victim.name)}<span class="sub2">${esc(r.victim.kind)}</span>` }, { h: '受理日期時間', cls: 'nowrap', f: r => fmtD(r.received) }, { h: '', f: r => `<button class="btn sm" data-act="vioIncEdit" data-id="${r.id}">編輯</button>` }], rows)}</div>`;
}
ACT.vioIncEdit = el => {
  const r = el.dataset.id ? S.vioIncidents.find(x => x.id === el.dataset.id) : null;
  const p0 = { name: '', sex: '', kind: '內部人員', unit: '' };
  const v = r || { date: TODAY, time: nowHM(), entity: 'L1', site: '', place: '', victim: { ...p0 }, actor: { ...p0 }, relation: '', cause: '', type: '', handling: '', follow: [], received: '', receiver: staffName(ME) };
  const person = (k, label, x) => `<div class="fsec"><h3>${label}</h3><div class="fgrid">${fld('姓名或特徵', inp(k + 'Name', x.name))}${fld('性別', `<div class="chks">${radios(k + 'Sex', ['男', '女'], x.sex)}</div>`)}${fld('人員類別', `<div class="chks">${radios(k + 'Kind', ['外部人員', '內部人員'], x.kind)}</div>`)}${fld('所屬部門／單位', inp(k + 'Unit', x.unit))}</div></div>`;
  const m = openModal({
    title: r ? '編輯事件通報與處理' : '新增事件通報與處理', size: 'lg',
    body: `<form><div class="fsec" style="margin-top:0"><h3>通報內容</h3><div class="fgrid">${fld('發生日期', dateInp('date', v.date), { req: 1 })}${fld('發生時間', `<input type="time" name="time" value="${esc(v.time)}">`)}${fld('法人', sel('entity', ORG.entities.map(x => [x.id, x.name]), v.entity))}${fld('廠／院區', sel('site', [['', '選擇'], ...SITE_OPTS], v.site), { req: 1 })}${fld('發生地點', inp('place', v.place), { cls: 'w2' })}</div></div>
      ${person('v', '受害者', v.victim)}${person('a', '加害者', v.actor)}
      <div class="fsec"><h3>事件經過與處理</h3><div class="fgrid">${fld('受害者及加害者關係', txt('relation', v.relation, 2), { cls: 'full' })}${fld('發生原因及過程', txt('cause', v.cause, 4), { cls: 'full' })}${fld('不法侵害類型', `<div class="chks">${radios('type', VIO_INC_TYPES, v.type)}</div>`, { cls: 'full', req: 1 })}
        ${fld('處理措施', txt('handling', v.handling, 3), { cls: 'full' })}${fld('後續協助（推定欄位）', chks('follow', VIO_FOLLOW, v.follow), { cls: 'full' })}${fld('受理人', inp('receiver', v.receiver))}${fld('受理日期時間', inp('received', v.received || `${TODAY} ${nowHM()}`, 'readonly'))}</div></div></form>`,
    foot: `<div class="left">${printBtns}</div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn primary" data-act="saveVioInc">儲存</button>`,
  });
  m.ctx.id = r?.id;
};
ACT.saveVioInc = () => {
  const o = formObj(curForm());
  if (!o.date || !o.site || !o.type) return toast('請填寫發生日期、廠區與不法侵害類型', 'warn');
  const x = topModal().ctx;
  let r = x.id ? S.vioIncidents.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('VI') }; S.vioIncidents.unshift(r); }
  Object.assign(r, { date: o.date, time: o.time, entity: o.entity, site: o.site, place: o.place, victim: { name: o.vName, sex: o.vSex, kind: o.vKind, unit: o.vUnit }, actor: { name: o.aName, sex: o.aSex, kind: o.aKind, unit: o.aUnit }, relation: o.relation, cause: o.cause, type: o.type, handling: o.handling, follow: o.follow, received: o.received, receiver: o.receiver });
  closeModal(); commit('已儲存事件通報與處理紀錄');
};
function vioReviewList() {
  const rows = [...S.vioReview].sort((a, b) => b.date.localeCompare(a.date));
  return `<div class="panel"><div class="toolbar" style="border-top:0"><button class="btn sm primary" data-act="vioReviewEdit">＋ 新增</button></div>
    ${tbl([{ h: '檢核日期', cls: 'nowrap', f: r => fmtD(r.date) }, { h: '廠／院區', f: r => esc(siteName(r.site)) }, { h: '部門', f: r => esc(deptName(r.dept)) }, { h: '已檢核項目', cls: 'num', f: r => `${Object.values(r.items).filter(x => x.pts.length || x.result).length}／${VIO_REVIEW.length}` }, { h: '簽核', f: r => signSummary(r) }, { h: '', f: r => `<button class="btn sm" data-act="vioReviewEdit" data-id="${r.id}">編輯</button>` }], rows)}</div>`;
}
ACT.vioReviewEdit = el => {
  const r = el.dataset.id ? S.vioReview.find(x => x.id === el.dataset.id) : null;
  const v = r || { date: TODAY, site: '', dept: '', items: {}, signers: [{ role: '職業安全衛生人員', name: '陳立民', email: 'safety.chen@example.com' }] };
  const m = openModal({
    title: r ? '編輯措施查核及評估' : '新增措施查核及評估', size: 'lg',
    body: `<form><div class="fgrid">${fld('檢核日期', dateInp('date', v.date), { req: 1 })}${fld('廠／院區', sel('site', [['', '選擇'], ...SITE_OPTS], v.site), { req: 1 })}${fld('部門', sel('dept', deptOptsFor(''), v.dept))}</div>
      <div class="fsec"><h3>查核項目</h3><div class="tbl-wrap"><table class="tbl form"><thead><tr><th>項目</th><th>檢點重點</th><th>結果</th><th>修正相關控制措施／改善情形採行措施</th></tr></thead><tbody>
        ${VIO_REVIEW.map((it, i) => { const x = v.items[i] || { pts: [] }; return `<tr><td class="nowrap">${esc(it.item)}</td><td>${chks(`v${i}_pts`, it.pts, x.pts, 'col')}</td><td>${txt(`v${i}_result`, x.result || '', 3, 'aria-label="結果"')}</td><td>${txt(`v${i}_fix`, x.fix || '', 3, 'aria-label="修正措施"')}</td></tr>`; }).join('')}
      </tbody></table></div></div><div class="fsec"><h3>簽核人員</h3>${signersEditor(v.signers)}</div></form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="signLog" data-coll="vioReview" data-id="${r?.id || ''}">確認紀錄查詢</button>${printBtns}</div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn" data-act="saveVioReview" data-send="1">Email 簽送</button><button class="btn primary" data-act="saveVioReview">儲存</button>`,
  });
  m.ctx.id = r?.id;
};
ACT.saveVioReview = el => {
  const o = formObj(curForm());
  if (!o.date || !o.site) return toast('請填寫檢核日期與廠區', 'warn');
  const x = topModal().ctx;
  let r = x.id ? S.vioReview.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('VV'), signers: [] }; S.vioReview.unshift(r); }
  Object.assign(r, { date: o.date, site: o.site, dept: o.dept, items: Object.fromEntries(VIO_REVIEW.map((_, i) => [i, { pts: o[`v${i}_pts`], result: o[`v${i}_result`], fix: o[`v${i}_fix`] }])), signers: readSigners(o, r.signers) });
  const n = el.dataset.send ? sendSign(r) : 0;
  closeModal(); commit(el.dataset.send ? `已儲存並寄出 ${n} 封簽核通知` : '已儲存措施查核及評估');
};

/* ====================================================================
   LABOUR HEALTH SERVICE RECORD (勞工健康服務執行紀錄表，附表八)
   ==================================================================== */
function svcRows() {
  const f = fval('svc');
  return S.svc.filter(r => inRange(r.date, f, 'd') && (!f.executor || r.executor === f.executor) && (!f.site || r.site === f.site)).sort((a, b) => b.date.localeCompare(a.date));
}
VIEWS.service = {
  title: () => '勞工健康服務執行紀錄表',
  render() {
    return `<div class="page-head"><div><h1>勞工健康服務執行紀錄表（附表八）</h1><p class="sub">臨場服務紀錄可複製沿用、以片語帶入內容，並 Email 簽送給醫護、職安衛人員與部門主管確認。</p></div></div>
    <div class="panel">${filterForm('svc', [{ k: 'd', label: '執行日期', type: 'date2' }, { k: 'executor', label: '執行人員', type: 'select', opts: docsAll() }, { k: 'site', label: '地點', type: 'select', opts: SITE_OPTS }])}
      <div class="toolbar"><button class="btn sm primary" data-act="svcEdit">＋ 新增</button><span class="sp"></span><span class="muted">每列可編輯、刪除或複製</span></div>
      ${tbl([
        { h: '執行日期', cls: 'nowrap', f: r => fmtD(r.date) }, { h: '執行時間', cls: 'nowrap mono', f: r => `${r.from}～${r.to}` }, { h: '執行人員', f: r => esc(staffName(r.executor)) },
        { h: '地點', f: r => esc(siteName(r.site)) }, { h: '部門名稱', f: r => esc(r.deptName) }, { h: '簽核', f: r => signSummary(r) },
        { h: '', f: r => `<div class="acts"><button class="btn sm" data-act="svcEdit" data-id="${r.id}">編輯</button><button class="btn sm" data-act="svcCopy" data-id="${r.id}" title="以此紀錄為範本建立新紀錄">複製</button><button class="btn sm ghost" data-act="svcDel" data-id="${r.id}" aria-label="刪除">刪除</button></div>` },
      ], svcRows())}</div>`;
  },
};
const spRow = (s = { cat: '', n: '' }) => `<tr><td>${sel('spCat[]', [['', '選擇作業類別'], ...SPECIAL_OPS], s.cat, 'aria-label="特別危害健康作業類別"')}</td><td><input type="number" name="spN[]" min="0" value="${esc(s.n)}" aria-label="人數" style="width:90px"></td><td><button type="button" class="btn sm ghost" data-act="rmSigner" aria-label="移除">×</button></td></tr>`;
ACT.addSp = el => el.closest('.fsec').querySelector('tbody.sp').insertAdjacentHTML('beforeend', spRow());
ACT.svcEdit = el => openSvc(el.dataset.id);
function openSvc(id) {
  const r = id ? S.svc.find(x => x.id === id) : null;
  const site = ORG.sites[0];
  const v = r || { date: TODAY, from: '09:00', to: '12:00', executor: ME, site: site.id, unit: entName(site.entity), deptName: '', adminM: 0, adminF: 0, opM: 0, opF: 0, general: 0, special: [], sec2: '', sec3: '', sec4: '', sec5: '', signers: [{ role: '勞工健康服務醫師', name: '吳建宏', email: 'dr.wu@example.com' }, { role: '勞工健康服務護理人員', name: staffName(ME), email: staff(ME).email }, { role: '職業安全衛生人員', name: '陳立民', email: 'safety.chen@example.com' }] };
  const addr = ORG.sites.find(s => s.id === v.site)?.address || '';
  const num = (n, val) => `<input type="number" name="${n}" min="0" value="${esc(val)}" style="width:80px" aria-label="${n}">`;
  const m = openModal({
    title: r ? '編輯勞工健康服務執行紀錄表' : '新增勞工健康服務執行紀錄表', size: 'lg', side: phrasePanel(['臨場健康服務', '處理狀況']),
    body: `<form><div class="fgrid">${fld('執行日期', dateInp('date', v.date), { req: 1 })}${fld('執行時間', `<div class="range"><input type="time" name="from" value="${v.from}" aria-label="開始"><span>～</span><input type="time" name="to" value="${v.to}" aria-label="結束"></div>`, { req: 1 })}${fld('執行人員', sel('executor', docs(v.executor), v.executor), { req: 1 })}${fld('地點', sel('site', SITE_OPTS, v.site, 'data-change="svcSite"'))}</div>
      <div class="fsec"><h3>一、作業場所基本資料</h3><div class="fgrid">${fld('地址', inp('address', addr), { cls: 'w2' })}${fld('事業單位', inp('unit', v.unit))}${fld('部門名稱', inp('deptName', v.deptName))}</div>
        <div class="fgrid" style="margin-top:12px">${fld('行政人員', `<div class="range">男 ${num('adminM', v.adminM)} 人；女 ${num('adminF', v.adminF)} 人</div>`)}${fld('現場操作人員', `<div class="range">男 ${num('opM', v.opM)} 人；女 ${num('opF', v.opF)} 人</div>`)}${fld('一般作業人數', num('general', v.general))}</div>
        <div style="margin-top:12px"><span class="lbl muted" style="font-size:12px">特別危害健康作業類別與人數</span><div class="tbl-wrap"><table class="tbl form"><tbody class="sp">${(v.special.length ? v.special : [{ cat: '', n: '' }]).map(spRow).join('')}</tbody></table></div><button type="button" class="btn sm" data-act="addSp" style="margin-top:6px">＋ 新增作業類別</button></div>
        <div style="margin-top:12px">${fld('相關附件', '<input type="file" name="attach" multiple>')}</div></div>
      <div class="fsec"><h3>二、作業場所與勞動條件概況</h3>${txt('sec2', v.sec2, 4, 'aria-label="作業場所與勞動條件概況"')}</div>
      <div class="fsec"><h3>三、臨場健康服務執行情形（本規則第九條至第十三條事項）</h3>${txt('sec3', v.sec3, 6, 'data-ph aria-label="臨場健康服務執行情形"')}</div>
      <div class="fsec"><h3>四、發現問題及建議採行措施（推定章節）</h3>${txt('sec4', v.sec4, 3, 'aria-label="發現問題及建議採行措施"')}</div>
      <div class="fsec"><h3>五、對前次建議改善事項之追蹤辦理情形（推定章節）</h3>${txt('sec5', v.sec5, 3, 'aria-label="前次建議追蹤"')}</div>
      <div class="fsec"><h3>六、執行人員及日期（簽核）</h3>${signersEditor(v.signers)}</div></form>`,
    foot: `<div class="left"><button class="btn ghost" data-act="signLog" data-coll="svc" data-id="${r?.id || ''}">確認紀錄查詢</button><button class="btn ghost" data-act="proto" data-what="自訂頁首頁尾">自訂頁首頁尾</button></div><button class="btn ghost" data-act="closeModal">返回</button><button class="btn" data-act="saveSvc" data-send="1">Email 簽送</button><button class="btn primary" data-act="saveSvc">儲存</button>`,
  });
  m.ctx.id = r?.id;
}
ACT.svcSite = el => {
  const s = ORG.sites.find(x => x.id === el.value);
  const f = el.closest('form');
  f.elements.address.value = s.address;
  f.elements.unit.value = entName(s.entity);
};
ACT.saveSvc = el => {
  const o = formObj(curForm());
  if (!o.date || !o.from || !o.to || !o.executor) return toast('請填寫執行日期、執行時間與執行人員', 'warn');
  if (o.to <= o.from) return toast('結束時間需晚於開始時間', 'warn');
  const x = topModal().ctx;
  let r = x.id ? S.svc.find(z => z.id === x.id) : null;
  if (!r) { r = { id: uid('SV'), signers: [] }; S.svc.unshift(r); }
  Object.assign(r, { date: o.date, from: o.from, to: o.to, executor: o.executor, site: o.site, unit: o.unit, deptName: o.deptName, adminM: +o.adminM || 0, adminF: +o.adminF || 0, opM: +o.opM || 0, opF: +o.opF || 0, general: +o.general || 0,
    special: (o.spCat || []).map((cat, i) => ({ cat, n: +o.spN[i] || 0 })).filter(s => s.cat), sec2: o.sec2, sec3: o.sec3, sec4: o.sec4, sec5: o.sec5, signers: readSigners(o, r.signers) });
  const n = el.dataset.send ? sendSign(r) : 0;
  closeModal(); commit(el.dataset.send ? `已儲存並寄出 ${n} 封簽核通知` : '已儲存執行紀錄表');
};
ACT.svcCopy = el => {
  const src = S.svc.find(x => x.id === el.dataset.id);
  const c = JSON.parse(JSON.stringify(src));
  Object.assign(c, { id: uid('SV'), date: TODAY, signers: c.signers.map(s => ({ ...s, sentFirst: null, sentLast: null, confirmed: null, comment: '' })) });
  S.svc.unshift(c);
  commit(`已複製 ${fmtD(src.date)} 的紀錄，請修改後儲存`);
  openSvc(c.id);
};
ACT.svcDel = el => confirmBox('確定要刪除這筆執行紀錄表嗎？', () => { S.svc = S.svc.filter(x => x.id !== el.dataset.id); commit('已刪除'); }, '刪除');
