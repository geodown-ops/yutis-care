import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import {
  copyForm, countByStatus, departmentOptions, executorsOf, filterRecords, formErrors, formFromRecord, forSite, groupOptions, myCompanies, newForm, OTHER_NAMES, readContent,
  roleOptions, serviceProblem, signerSuggestions, signersText, signProgress, siteDepartments, splitByEmailed, timeRange, toBody, unitForSite, usedValues, withDepartmentName,
  type OrgEntity, type ServiceRecord, type Signature,
} from './records';

const ME = { id: 'u-me', name: '王護理師', email: 'nurse@demo.test' };

const ORG: OrgEntity[] = [
  { id: 'e1', code: 'DEMO', name: '示範科技', sites: [
    { id: 'site-1', code: 'TY', name: '桃園廠', mine: true, departments: [{ id: 'd1', code: 'MFG1', name: '製造一課' }, { id: 'd2', code: null, name: '品保部' }] },
    { id: 'site-3', code: 'HC', name: '新竹廠', mine: false, departments: [{ id: 'd3', code: null, name: '研發部' }] },
  ] },
  { id: 'e2', code: 'DM02', name: '示範服務', sites: [{ id: 'site-2', code: 'TP', name: '台北總部', mine: true, departments: [{ id: 'd4', code: null, name: '品保部' }] }] },
  { id: 'e3', code: 'X', name: '別人的公司', sites: [{ id: 'site-4', code: 'X1', name: '高雄廠', mine: false, departments: [] }] },
];

const sig = (role: string, signedAt: string | null = null): Signature =>
  ({ id: `s-${role}`, role, name: `${role}人`, email: `${role}@x.test`, firstSentAt: null, sentAt: null, signedAt, comment: null });

const record = (id: string, status: ServiceRecord['status'], serviceOn: string, extra: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id, status, serviceOn, siteId: 'site-1', siteName: '桃園廠', departmentId: 'd1',
  content: {
    from: '09:00', to: '12:00', executorUserId: 'u-other', unit: '示範科技', departmentName: '製造一課',
    headcount: { adminM: 1, adminF: 2, opM: 3, opF: 4, general: 5 }, special: [{ category: '噪音作業', count: 6 }],
    workplace: '二', services: '三', findings: '四', followUp: '五',
  },
  executorName: '吳工安',
  signatures: [sig('勞工健康服務醫師', '2026-09-02T03:00:00Z'), sig('職業安全衛生人員')],
  ...extra,
});

describe('readContent', () => {
  it('reads a stored record', () => {
    const c = readContent(record('a', '草稿', '2026-09-01').content);
    expect(c.headcount).toEqual({ adminM: 1, adminF: 2, opM: 3, opF: 4, general: 5 });
    expect(c.special).toEqual([{ category: '噪音作業', count: 6 }]);
    expect(timeRange(c)).toBe('09:00～12:00');
  });

  it('turns missing or malformed fields into empty values', () => {
    const c = readContent({ from: 9, headcount: { adminM: -1, opF: 'x' }, special: [null, { category: '鉛作業' }] });
    expect(c.from).toBe('');
    expect(c.headcount).toEqual({ adminM: 0, adminF: 0, opM: 0, opF: 0, general: 0 });
    expect(c.special).toEqual([{ category: '鉛作業', count: 0 }]);
    expect(readContent(null).services).toBe('');
    expect(timeRange(c)).toBe('—');
  });
});

describe('forms and request bodies', () => {
  it('starts a new record today, executed by me, with me as the first signer', () => {
    const f = newForm({ today: '2026-10-04', siteId: 'site-1', me: ME });
    expect(f).toMatchObject({ serviceOn: '2026-10-04', siteId: 'site-1', executorUserId: 'u-me', signers: [{ role: '', name: '王護理師', email: 'nurse@demo.test' }] });
    expect(formErrors(f)).toEqual({ signers: '每位簽核人員都要填人員類別與姓名' });
  });

  it('round-trips a record into a form and back into the same body', () => {
    const r = record('a', '草稿', '2026-09-01');
    const body = toBody(formFromRecord(r));
    expect(body.serviceOn).toBe('2026-09-01');
    expect(body.departmentId).toBe('d1');
    expect(body.content).toEqual(r.content);
    expect(body.signers).toEqual([
      { role: '勞工健康服務醫師', name: '勞工健康服務醫師人', email: '勞工健康服務醫師@x.test' },
      { role: '職業安全衛生人員', name: '職業安全衛生人員人', email: '職業安全衛生人員@x.test' },
    ]);
  });

  it('links an older record without a department to the site department of its name, once the organisation is known', () => {
    const old = record('a', '草稿', '2026-09-01', { departmentId: null });
    expect(formFromRecord(old).departmentId).toBeNull();
    expect(formFromRecord(old, ORG)).toMatchObject({ departmentId: 'd1', departmentName: '製造一課' });
    const typed = record('b', '草稿', '2026-09-01', { departmentId: null, content: { ...old.content, departmentName: '外包清潔組' } });
    expect(formFromRecord(typed, ORG)).toMatchObject({ departmentId: null, departmentName: '外包清潔組' });
    // The name of another site's department does not link.
    expect(formFromRecord({ ...old, siteId: 'site-3' }, ORG).departmentId).toBeNull();
    expect(toBody(newForm({ today: '2026-10-04', siteId: 's', me: ME })).departmentId).toBeNull();
  });

  it('copies content and signers to a new draft dated today, executed by me', () => {
    const f = copyForm(record('a', '已完成', '2026-09-01'), '2026-10-04', 'u-me');
    expect(f.serviceOn).toBe('2026-10-04');
    expect(f.executorUserId).toBe('u-me');
    expect(f.departmentId).toBe('d1');
    expect(f.special).toEqual([{ category: '噪音作業', count: 6 }]);
    expect(f.signers).toHaveLength(2);
  });

  it('links 部門名稱 to the site department of that name', () => {
    const depts = siteDepartments(ORG, 'site-1');
    expect(withDepartmentName(depts, '品保部')).toEqual({ departmentName: '品保部', departmentId: 'd2' });
    expect(withDepartmentName(depts, ' 品保部 ')).toEqual({ departmentName: ' 品保部 ', departmentId: 'd2' });
    expect(withDepartmentName(depts, '品保')).toEqual({ departmentName: '品保', departmentId: null });
    expect(withDepartmentName(depts, '')).toEqual({ departmentName: '', departmentId: null });
  });

  it('drops the department, with its name, when the site changes; a typed name stays', () => {
    const f = { ...newForm({ today: '2026-10-04', siteId: 'site-1', me: ME, unit: '示範科技' }), departmentId: 'd2', departmentName: '品保部' };
    expect(forSite(ORG, f, 'site-2')).toMatchObject({ siteId: 'site-2', unit: '示範服務', departmentId: null, departmentName: '' });
    expect(forSite(ORG, f, 'site-1')).toBe(f);
    const typed = { ...f, departmentId: null, departmentName: '品保部 ' };
    // Typed, it is linked when the new site has a department of that name.
    expect(forSite(ORG, { ...typed, siteId: 'site-3' }, 'site-2')).toMatchObject({ departmentId: 'd4', departmentName: '品保部 ' });
    expect(forSite(ORG, { ...typed, departmentName: '外包清潔組' }, 'site-2')).toMatchObject({ departmentId: null, departmentName: '外包清潔組' });
    // Without the organisation, only the link goes.
    expect(forSite(undefined, f, 'site-2')).toMatchObject({ siteId: 'site-2', unit: '示範科技', departmentId: null, departmentName: '品保部' });
  });

  it('trims text, drops empty special rows and blank signer rows, lower-cases emails', () => {
    const f = { ...newForm({ today: '2026-10-04', siteId: 's', me: ME }), unit: '  示範 ', special: [{ category: ' ', count: 0 }, { category: ' 粉塵作業 ', count: 2 }],
      signers: [{ role: ' 勞工健康服務護理人員 ', name: ' 王護理師 ', email: ' Nurse@Demo.test ' }, { role: '', name: '', email: '' }] };
    const b = toBody(f);
    expect(b.content.unit).toBe('示範');
    expect(b.content.special).toEqual([{ category: '粉塵作業', count: 2 }]);
    expect(b.signers).toEqual([{ role: '勞工健康服務護理人員', name: '王護理師', email: 'nurse@demo.test' }]);
    expect(formErrors(f)).toEqual({});
  });

  it('checks what the API checks', () => {
    const ok = { ...newForm({ today: '2026-10-04', siteId: 's', me: ME }), signers: [{ role: '勞工代表', name: '甲', email: 'a@b.tw' }] };
    expect(formErrors(ok)).toEqual({});
    expect(formErrors(ok, ['勞工代表', '其他'])).toEqual({});
    expect(formErrors(ok, ['勞工健康服務醫師']).signers).toContain('簽核角色');
    expect(formErrors({ ...ok, executorUserId: '' }).executorUserId).toBe('請選擇執行人員');
    expect(formErrors({ ...ok, to: '08:00' }).to).toBe('結束時間需晚於開始時間');
    expect(formErrors({ ...ok, from: '' }).from).toBeDefined();
    expect(formErrors({ ...ok, siteId: '' }).siteId).toBeDefined();
    expect(formErrors({ ...ok, serviceOn: '' }).serviceOn).toBeDefined();
    expect(formErrors({ ...ok, special: [{ category: '', count: 3 }] }).special).toBeDefined();
    expect(formErrors({ ...ok, signers: [] }).signers).toBe('至少要有一位簽核人員');
    expect(formErrors({ ...ok, signers: [{ role: '勞工代表', name: '甲', email: 'not-an-email' }] }).signers).toBe('請確認簽核人員的 Email');
    expect(formErrors({ ...ok, signers: Array.from({ length: 11 }, (_, i) => ({ role: 'r', name: `n${i}`, email: `n${i}@b.tw` })) }).signers).toBe('簽核人員最多 10 位');
  });
});

describe('list helpers', () => {
  // b: an older record at 台北總部 whose 部門名稱 is no department there; c: an older one at 桃園廠 without departmentId.
  const list = [
    record('a', '草稿', '2026-09-20'), record('b', '簽核中', '2026-08-01', { siteId: 'site-2', departmentId: null }),
    record('c', '已完成', '2026-07-15', { departmentId: null }),
  ];
  const D1 = { id: 'd1', siteId: 'site-1', name: '製造一課' };

  it('counts per status and sign-off progress', () => {
    expect(countByStatus(list)).toEqual({ 草稿: 1, 簽核中: 1, 已完成: 1 });
    expect(signProgress(list[0]!.signatures)).toEqual({ signed: 1, total: 2 });
  });

  it('filters by status, company, site, department, executor and an inclusive date range', () => {
    expect(filterRecords(list, {}).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterRecords(list, { status: '簽核中' }).map(r => r.id)).toEqual(['b']);
    expect(filterRecords(list, { siteId: 'site-1' }).map(r => r.id)).toEqual(['a', 'c']);
    expect(filterRecords(list, { companySites: ['site-2', 'site-9'] }).map(r => r.id)).toEqual(['b']);
    expect(filterRecords(list, { department: D1 }).map(r => r.id)).toEqual(['a', 'c']);
    expect(filterRecords(list, { department: { name: '製造一課' } }).map(r => r.id)).toEqual(['b', 'c']);
    expect(filterRecords(list, { department: { id: 'd2', siteId: 'site-1', name: '品保部' } })).toEqual([]);
    expect(filterRecords(list, { executor: 'u-other' })).toHaveLength(3);
    expect(filterRecords(list, { executor: 'u-me' })).toEqual([]);
    expect(filterRecords(list, { from: '2026-08-01', to: '2026-09-20' }).map(r => r.id)).toEqual(['a', 'b']);
  });

  it('matches a record by departmentId over its name', () => {
    // Renamed since: the record keeps the old name but is still the department's.
    const renamed = record('r', '已完成', '2026-07-01', { content: { ...list[0]!.content, departmentName: '製造課' } });
    expect(filterRecords([renamed], { department: D1 })).toHaveLength(1);
    expect(filterRecords([renamed], { department: { name: '製造課' } })).toEqual([]);
    expect(filterRecords([record('x', '草稿', '2026-07-01', { departmentId: 'd2' })], { department: D1 })).toEqual([]);
  });

  it('offers the departments in scope by site, then other names on older records', () => {
    const extra = record('e', '草稿', '2026-07-01', { departmentId: null, content: { ...list[0]!.content, departmentName: '外包清潔組' } });
    const all = departmentOptions(ORG, [...list, extra]);
    expect(all.map(o => [o.group, o.label, o.value])).toEqual([
      ['桃園廠', '製造一課', 'd1'], ['桃園廠', '品保部', 'd2'], ['台北總部', '品保部', 'd4'],
      [OTHER_NAMES, '外包清潔組', 'name:外包清潔組'], [OTHER_NAMES, '製造一課', 'name:製造一課'],
    ]);
    expect(all[0]!.match).toEqual(D1);
    expect(departmentOptions(ORG, [...list, extra], ['site-2']).map(o => o.value)).toEqual(['d4', 'name:製造一課']);
    expect(departmentOptions(ORG, list, ['site-3']).map(o => o.label)).toEqual(['研發部']);
    // Without the organisation, only the names on older records.
    expect(departmentOptions([], list).map(o => o.value)).toEqual(['name:製造一課']);
  });

  it('groups the department choices only when there is more than one group', () => {
    const opts = departmentOptions(ORG, list);
    expect(groupOptions(departmentOptions(ORG, [], ['site-1']))).toEqual([{ value: 'd1', label: '製造一課' }, { value: 'd2', label: '品保部' }]);
    expect(groupOptions(opts)).toEqual([
      { group: '桃園廠', items: [{ value: 'd1', label: '製造一課' }, { value: 'd2', label: '品保部' }] },
      { group: '台北總部', items: [{ value: 'd4', label: '品保部' }] },
      { group: OTHER_NAMES, items: [{ value: 'name:製造一課', label: '製造一課' }] },
    ]);
    expect(groupOptions([])).toEqual([]);
  });

  it('lists each executor once by name', () => {
    expect(executorsOf([...list, record('d', '草稿', '2026-07-01', { executorName: null, content: { executorUserId: 'u-gone' } })]))
      .toEqual([{ value: 'u-other', label: '吳工安' }, { value: 'u-gone', label: '已刪除的帳號' }].sort((a, b) => a.label.localeCompare(b.label, 'zh-Hant')));
  });

  it('suggests values already used, once each', () => {
    expect(usedValues(list, r => r.signatures.map(s => s.role))).toEqual(['勞工健康服務醫師', '職業安全衛生人員'].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
    expect(usedValues([], () => [])).toEqual([]);
  });
});

describe('organisation, roles and email', () => {
  it('offers companies with my sites, and the departments of a site', () => {
    expect(myCompanies(ORG)).toEqual([{ id: 'e1', name: '示範科技', siteIds: ['site-1'] }, { id: 'e2', name: '示範服務', siteIds: ['site-2'] }]);
    expect(siteDepartments(ORG, 'site-1')).toEqual([{ id: 'd1', name: '製造一課' }, { id: 'd2', name: '品保部' }]);
    expect(siteDepartments(ORG, 'site-x')).toEqual([]);
  });

  it('follows the site with 事業單位 unless someone typed their own', () => {
    expect(unitForSite(ORG, { siteId: 'site-1', unit: '' }, 'site-2')).toBe('示範服務');
    expect(unitForSite(ORG, { siteId: 'site-1', unit: '示範科技' }, 'site-2')).toBe('示範服務');
    expect(unitForSite(ORG, { siteId: 'site-1', unit: '外包商' }, 'site-2')).toBe('外包商');
  });

  it('keeps a role a record uses that is no longer configured, marked', () => {
    expect(roleOptions(['勞工代表', '其他'], ['其他', ' 舊角色 ', ''])).toEqual([
      { value: '勞工代表', label: '勞工代表' }, { value: '其他', label: '其他' }, { value: '舊角色', label: '舊角色（已不在簽核角色）' },
    ]);
  });

});

describe('sign-off links and signers', () => {
  const link = (name: string, emailed: boolean) => ({ signatureId: `s-${name}`, role: '職醫', name, url: `https://demo.test/sign/${name}`, emailed });

  it('splits the links the API emailed from the ones to hand over', () => {
    const { sent, unsent } = splitByEmailed([link('甲', true), link('乙', false), link('丙', false)]);
    expect(sent.map(l => l.name)).toEqual(['甲']);
    expect(unsent.map(l => l.name)).toEqual(['乙', '丙']);
    expect(signersText(unsent)).toBe('2 位簽核人員');
    expect(signersText(sent)).toBe('甲');
  });

  it('suggests staff for a signer by name or email', () => {
    const staff = [
      { id: 'u1', name: '張醫師', email: 'doctor@demo.test', role: '職醫' as const },
      { id: 'u2', name: '張醫師', email: 'chang.2@demo.test', role: '職醫' as const },
      { id: 'u3', name: '吳工安', email: 'safety@demo.test', role: '職安衛人員' as const },
    ];
    expect(signerSuggestions(staff, ' 張 ').map(s => s.id)).toEqual(['u1', 'u2']);
    expect(signerSuggestions(staff, 'SAFETY').map(s => s.id)).toEqual(['u3']);
    expect(signerSuggestions(staff, '')).toHaveLength(3);
    expect(signerSuggestions(staff, '', 2)).toHaveLength(2);
  });
});

describe('serviceProblem', () => {
  it('explains API error codes in plain words', () => {
    expect(serviceProblem(new ApiRequestError(400, 'unknown_sign_off_role', ''))).toContain('簽核角色');
    expect(serviceProblem(new ApiRequestError(409, 'not_draft', ''))).toContain('不能再修改');
    expect(serviceProblem(new ApiRequestError(400, 'unknown_department', ''))).toContain('重新選擇部門');
    expect(serviceProblem(new ApiRequestError(403, 'forbidden', ''))).toContain('角色');
    expect(serviceProblem(new Error('offline'))).toContain('網路');
  });
});
