import type { ComboboxParsedItem } from '@mantine/core';
import { describe, expect, it } from 'vitest';
import { staffFilter, staffName, staffOptions, type StaffMember } from './staff';

const STAFF: StaffMember[] = [
  { id: 'u-doc', name: '張醫師', email: 'chang@demo.test', role: '職醫' },
  { id: 'u-me', name: '王護理師', email: 'wang@demo.test', role: '職護' },
  { id: 'u-n2', name: '林護理師', email: 'lin@demo.test', role: '職護' },
];
const TWINS: StaffMember[] = [...STAFF, { id: 'u-n3', name: '林護理師', email: 'lin.2@demo.test', role: '職護' }];

describe('staff pickers', () => {
  it('puts me first and names each person with their role, the email under it', () => {
    expect(staffOptions(STAFF, 'u-me')).toEqual([
      { value: 'u-me', label: '王護理師（職護・我）', title: '王護理師（職護・我）', email: 'wang@demo.test' },
      { value: 'u-doc', label: '張醫師（職醫）', title: '張醫師（職醫）', email: 'chang@demo.test' },
      { value: 'u-n2', label: '林護理師（職護）', title: '林護理師（職護）', email: 'lin@demo.test' },
    ]);
  });

  it('adds the email to the label when two people share a name', () => {
    const labels = staffOptions(TWINS, 'u-me').map(o => o.label);
    expect(labels).toEqual(['王護理師（職護・我）', '張醫師（職醫）', '林護理師（職護） lin@demo.test', '林護理師（職護） lin.2@demo.test']);
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

  it('searches by name, role or email', () => {
    const options = staffOptions(STAFF, 'u-me') as ComboboxParsedItem[];
    const values = (search: string) => staffFilter({ options, search }).map(o => ('value' in o ? o.value : null));
    expect(values('LIN@')).toEqual(['u-n2']);
    expect(values('職醫')).toEqual(['u-doc']);
    expect(values(' ')).toHaveLength(3);
  });

  it('names a staff member, with the email when the name is shared, or says 其他人員 when unknown', () => {
    expect(staffName(STAFF, 'u-n2')).toBe('林護理師');
    expect(staffName(TWINS, 'u-n3')).toBe('林護理師（lin.2@demo.test）');
    expect(staffName(STAFF, 'u-gone')).toBe('其他人員');
    expect(staffName(undefined, 'u-n2')).toBe('其他人員');
  });
});
