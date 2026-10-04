import { describe, expect, it } from 'vitest';
import { csvCell, csvText, markReminded, matchOrg, orgOptions, reminderText, siteDepartments, type OrgEntity } from './lists';

const rows = [
  { site: '桃園廠', department: '製造二課' },
  { site: '桃園廠', department: '製造一課' },
  { site: '新竹廠', department: '研發部' },
  { site: '桃園廠', department: '製造一課' },
];

describe('site and department filters', () => {
  it('offers the sites in the list and the departments of the chosen site', () => {
    const all = orgOptions(rows, null);
    expect(all.sites).toHaveLength(2);
    expect(all.departments).toHaveLength(3);
    expect(orgOptions(rows, '桃園廠').departments.sort()).toEqual(['製造一課', '製造二課'].sort());
  });

  it('matches on whichever parts are chosen', () => {
    expect(rows.filter(r => matchOrg(r, { site: '桃園廠', department: null }))).toHaveLength(3);
    expect(rows.filter(r => matchOrg(r, { site: null, department: '製造一課' }))).toHaveLength(2);
    expect(rows.filter(r => matchOrg(r, { site: null, department: null }))).toHaveLength(4);
  });

  it('finds the departments of a site in the organisation tree', () => {
    const org: OrgEntity[] = [{ id: 'l', code: 'L', name: '法人', sites: [
      { id: 's1', code: 'TY', name: '桃園廠', mine: true, departments: [{ id: 'd1', code: null, name: '製造一課' }] },
      { id: 's2', code: 'HC', name: '新竹廠', mine: false, departments: [] },
    ] }];
    expect(siteDepartments(org, 's1').map(d => d.id)).toEqual(['d1']);
    expect(siteDepartments(org, 'nope')).toEqual([]);
    expect(siteDepartments(org, null)).toEqual([]);
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

  it('says who could not be reached', () => {
    expect(reminderText(3, [])).toBe('已寄出 3 封催填通知。');
    expect(reminderText(0, ['王小明', '林小美'])).toBe('沒有寄出催填通知。王小明、林小美 沒有 Email，請另行通知。');
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
