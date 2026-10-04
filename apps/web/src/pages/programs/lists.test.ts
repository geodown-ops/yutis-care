import { describe, expect, it } from 'vitest';
import {
  csvCell, csvText, markReminded, matchOrg, orgOptions, reminderText, rowNames, siteDepartments, treeNames, withRowDepartments, type OrgEntity,
} from './lists';

const rows = [
  { siteId: 'ty', site: '桃園廠', departmentId: 'ty-m2', department: '製造二課' },
  { siteId: 'ty', site: '桃園廠', departmentId: 'ty-m1', department: '製造一課' },
  { siteId: 'hc', site: '新竹廠', departmentId: 'hc-rd', department: '研發部' },
  { siteId: 'ty', site: '桃園廠', departmentId: 'ty-m1', department: '製造一課' },
];
const names = rowNames(rows);

describe('site and department filters', () => {
  it('offers the sites in the list and the departments of the chosen site, by id', () => {
    const all = orgOptions(rows, null, names);
    expect(all.sites.map(s => s.value).sort()).toEqual(['hc', 'ty']);
    expect(all.sites.find(s => s.value === 'hc')?.label).toBe('新竹廠');
    expect(all.departments).toHaveLength(3);
    expect(orgOptions(rows, 'ty', names).departments.map(d => d.value).sort()).toEqual(['ty-m1', 'ty-m2']);
  });

  it('labels a department name used in two sites with its site', () => {
    const twice = [...rows, { siteId: 'hc', site: '新竹廠', departmentId: 'hc-m1', department: '製造一課' }];
    const labels = orgOptions(twice, null, rowNames(twice)).departments.map(d => d.label);
    expect(labels).toEqual(expect.arrayContaining(['製造一課（桃園廠）', '製造一課（新竹廠）', '製造二課', '研發部']));
    // Within one site the name is unique again.
    expect(orgOptions(twice, 'hc', rowNames(twice)).departments.map(d => d.label).sort()).toEqual(['研發部', '製造一課'].sort());
  });

  it('leaves out rows without a site or department', () => {
    const o = orgOptions([{ siteId: 'ty' }, { departmentId: 'x' }, { siteId: null, departmentId: null }], null, names);
    expect(o.sites.map(s => s.value)).toEqual(['ty']);
    expect(o.departments.map(d => d.value)).toEqual(['x']);
  });

  it('matches on whichever ids are chosen', () => {
    expect(rows.filter(r => matchOrg(r, { siteId: 'ty', departmentId: null }))).toHaveLength(3);
    expect(rows.filter(r => matchOrg(r, { siteId: null, departmentId: 'ty-m1' }))).toHaveLength(2);
    expect(rows.filter(r => matchOrg(r, { siteId: 'hc', departmentId: 'ty-m1' }))).toHaveLength(0);
    expect(rows.filter(r => matchOrg(r, { siteId: null, departmentId: null }))).toHaveLength(4);
  });

  const org: OrgEntity[] = [{ id: 'l', code: 'L', name: '法人', sites: [
    { id: 's1', code: 'TY', name: '桃園廠', mine: true, departments: [{ id: 'd1', code: null, name: '製造一課' }] },
    { id: 's2', code: 'HC', name: '新竹廠', mine: false, departments: [] },
  ] }];

  it('finds the departments of a site in the organisation tree', () => {
    expect(siteDepartments(org, 's1').map(d => d.id)).toEqual(['d1']);
    expect(siteDepartments(org, 'nope')).toEqual([]);
    expect(siteDepartments(org, null)).toEqual([]);
  });

  it('names sites and departments from the organisation tree', () => {
    const t = treeNames(org);
    expect(t.site('s2')).toBe('新竹廠');
    expect(t.department('d1')).toBe('製造一課');
    expect(t.department('nope')).toBe('—');
  });

  it('prefers the department names the rows carry, and falls back to the tree', () => {
    const t = withRowDepartments(treeNames(org), [
      { departmentId: 'd1', departmentName: '製造一課（改名後）' }, { departmentId: 'd9', departmentName: '倉儲課' }, { departmentId: null, departmentName: null },
    ]);
    expect(t.department('d1')).toBe('製造一課（改名後）');
    expect(t.department('d9')).toBe('倉儲課');
    expect(t.department('nope')).toBe('—');
    expect(t.site('s1')).toBe('桃園廠');
  });
});

describe('reminders', () => {
  const list = [
    { id: 'a', employeeId: 'e1', reminders: 0, lastRemindedAt: null },
    { id: 'b', employeeId: 'e2', reminders: 2, lastRemindedAt: '2026-09-01T00:00:00Z' },
    { id: 'c', employeeId: 'e3', reminders: 0, lastRemindedAt: null },
  ];

  it('counts one more reminder for everyone asked about who could be emailed', () => {
    const out = markReminded(list, new Set(['a', 'b']), ['e2'], '2026-10-04T01:00:00Z');
    expect(out.map(r => r.reminders)).toEqual([1, 2, 0]);
    expect(out[0]!.lastRemindedAt).toBe('2026-10-04T01:00:00Z');
    expect(out[1]!.lastRemindedAt).toBe('2026-09-01T00:00:00Z');
  });

  it('says an email went out only when the mail service really sends', () => {
    expect(reminderText({ emailed: 3, delivered: true }, [])).toBe('已寄催填信給 3 位員工。');
    expect(reminderText({ emailed: 3, delivered: false }, [])).toBe('已催填 3 位員工。');
    expect(reminderText({ emailed: 2, delivered: true }, ['王小明'])).toBe('已寄催填信給 2 位員工。王小明 沒有 Email，請另行通知。');
  });

  it('says who could not be reached', () => {
    expect(reminderText({ emailed: 0, delivered: true }, ['王小明', '林小美'])).toBe('沒有可以寄提醒信的員工。王小明、林小美 沒有 Email，請另行通知。');
    expect(reminderText({ emailed: 0, delivered: false }, [])).toBe('沒有可以寄提醒信的員工。');
  });
});

describe('CSV export', () => {
  it('quotes separators and neutralises formulas', () => {
    expect(csvCell(null)).toBe('');
    expect(csvCell(3.5)).toBe('3.5');
    expect(csvCell(-2)).toBe('-2');
    expect(csvCell('a,b')).toBe('"a,b"');
    expect(csvCell('說 "好"')).toBe('"說 ""好"""');
    expect(csvCell('第一行\n第二行')).toBe('"第一行\n第二行"');
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell('+886')).toBe("'+886");
  });

  it('writes a header row and one line per row', () => {
    const text = csvText([{ h: '姓名', v: (r: { n: string; s: number | null }) => r.n }, { h: '分數', v: r => r.s }], [{ n: '王小明', s: 3 }, { n: '林,小美', s: null }]);
    expect(text).toBe('姓名,分數\r\n王小明,3\r\n"林,小美",');
  });
});
