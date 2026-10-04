import { describe, expect, it } from 'vitest';
import { staffName, staffOptions, type StaffMember } from './staff';

const STAFF: StaffMember[] = [
  { id: 'u-doc', name: '張醫師', role: '職醫' },
  { id: 'u-me', name: '王護理師', role: '職護' },
  { id: 'u-n2', name: '林護理師', role: '職護' },
];

describe('staff pickers', () => {
  it('puts me first and names each person with their role', () => {
    expect(staffOptions(STAFF, 'u-me')).toEqual([
      { value: 'u-me', label: '王護理師（職護・我）' },
      { value: 'u-doc', label: '張醫師（職醫）' },
      { value: 'u-n2', label: '林護理師（職護）' },
    ]);
  });

  it('keeps people a record already names once each, marked as deactivated', () => {
    const opts = staffOptions(STAFF, 'u-x', [{ id: 'u-doc', name: '張醫師' }, { id: 'u-old', name: '陳護理師' }, { id: 'u-old' }, { id: 'u-gone' }, { id: null }]);
    expect(opts.map(o => o.label)).toEqual(['張醫師（職醫）', '王護理師（職護）', '林護理師（職護）', '陳護理師（已停用）', '其他人員（已停用）']);
  });

  it('offers only the people already named while the list loads', () => {
    expect(staffOptions(undefined, 'u-me', [{ id: 'u-me', name: '王護理師' }, { id: 'u-me' }, { id: 'u-x' }])).toEqual([
      { value: 'u-me', label: '王護理師' }, { value: 'u-x', label: '…' },
    ]);
  });

  it('names a staff member, or says 其他人員 when unknown', () => {
    expect(staffName(STAFF, 'u-n2')).toBe('林護理師');
    expect(staffName(STAFF, 'u-gone')).toBe('其他人員');
    expect(staffName(undefined, 'u-n2')).toBe('其他人員');
  });
});
