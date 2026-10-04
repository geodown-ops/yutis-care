import { describe, expect, it } from 'vitest';
import { emptyMappingForm, mappingBody, mappingProblems, mappingSummary, mappingToForm, MAPPABLE_ITEMS } from './mappings';
import { flattenDepartments, flattenSites, siteNames, siteOptions, type LegalEntity } from './org';

const dept = (id: string, name: string) => ({ id, code: null, name, managerName: null, managerEmail: null, managerPhone: null });
const TREE: LegalEntity[] = [
  { id: 'le1', code: 'DEMO', name: '示範科技', sites: [
    { id: 's1', code: 'HC', name: '新竹廠', address: null, departments: [dept('d1', '研發部')] },
    { id: 's2', code: 'TY', name: '桃園廠', address: null, departments: [dept('d2', '品保部'), dept('d3', '製造一課')] },
  ] },
  { id: 'le2', code: 'DM02', name: '示範服務', sites: [{ id: 's3', code: 'TP', name: '台北總部', address: '台北市', departments: [] }] },
  { id: 'le3', code: 'EMPTY', name: '空法人', sites: [] },
];

describe('organisation helpers', () => {
  it('flattens sites and departments with their parents', () => {
    expect(flattenSites(TREE).map(s => `${s.legalEntity.code}/${s.code}`)).toEqual(['DEMO/HC', 'DEMO/TY', 'DM02/TP']);
    expect(flattenDepartments(TREE).map(d => `${d.site.code}/${d.name}`)).toEqual(['HC/研發部', 'TY/品保部', 'TY/製造一課']);
  });

  it('groups site options by legal entity only when there is more than one with sites', () => {
    expect(siteOptions(TREE)).toEqual([
      { group: '示範科技', items: [{ value: 's1', label: '新竹廠（HC）' }, { value: 's2', label: '桃園廠（TY）' }] },
      { group: '示範服務', items: [{ value: 's3', label: '台北總部（TP）' }] },
    ]);
    expect(siteOptions([TREE[0]!, TREE[2]!])).toEqual([{ value: 's1', label: '新竹廠（HC）' }, { value: 's2', label: '桃園廠（TY）' }]);
  });

  it('names sites in tree order and skips unknown ids', () => {
    expect(siteNames(TREE, ['s3', 'gone', 's1'])).toEqual(['新竹廠', '台北總部']);
  });
});

describe('exam mapping helpers', () => {
  it('lists each exam item code once', () => {
    const codes = MAPPABLE_ITEMS.map(i => i.code);
    expect(new Set(codes).size).toBe(codes.length);
    expect(codes).toContain('B0501');
  });

  it('needs a clinic, an employee match column, the exam date and one item', () => {
    expect(mappingProblems(emptyMappingForm())).toEqual({
      clinic: '請填寫健檢醫院名稱', match: '請對照工號或身分證字號欄位，才能找到員工', examDate: '請對照檢查日期欄位', items: '至少對照一個檢查項目',
    });
    expect(mappingProblems({ clinic: '仁安', columns: { nationalId: '身分證', examDate: '日期' }, items: { B0111: ' ' } })).toEqual({ items: '至少對照一個檢查項目' });
  });

  it('sends trimmed headers and drops blank ones', () => {
    expect(mappingBody({ clinic: ' 仁安 ', columns: { empNo: ' 工號 ', examDate: '日期', kind: '' }, items: { B0111: '收縮壓', B0112: '  ' } }))
      .toEqual({ clinic: '仁安', columns: { empNo: '工號', examDate: '日期' }, items: { B0111: '收縮壓' } });
  });

  it('reads a stored mapping back into the form and summarises it', () => {
    const stored = { id: 'm1', clinic: '仁安', mapping: { columns: { empNo: '工號', nationalId: '身分證', examDate: '日期', smoker: 7 }, items: { B0111: 'SBP', B0112: 'DBP' } } };
    expect(mappingToForm(stored)).toEqual({ clinic: '仁安', columns: { empNo: '工號', nationalId: '身分證', examDate: '日期' }, items: { B0111: 'SBP', B0112: 'DBP' } });
    expect(mappingSummary(stored)).toEqual({ matchBy: '工號、身分證字號', items: 2, fields: 3 });
    expect(mappingToForm({ id: 'm2', clinic: 'X', mapping: {} })).toEqual({ clinic: 'X', columns: {}, items: {} });
  });
});
