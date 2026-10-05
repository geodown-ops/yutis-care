import { describe, expect, it } from 'vitest';
import { createEmployeeBody, emptyEmployeeForm, employeeFormProblems, employeeToForm, updateEmployeeBody, type EmployeeRecord } from './employeeMaster';

const record: EmployeeRecord = {
  id: 'e1', empNo: 'E001', name: '林志明', sex: '男', birthDate: '1985-06-01', legalEntityId: 'le', siteId: 's1', departmentId: 'd1',
  title: '技術員', shift: null, examCategory: null, specialOperations: ['噪音', '粉塵'], lang: 'zh', hireDate: null,
  email: 'lin@acme.test', phone: null, status: '在職', nationalIdMasked: 'A1•••••789',
};

describe('employee form', () => {
  it('lists every missing or malformed field', () => {
    expect(Object.keys(employeeFormProblems(emptyEmployeeForm())).sort()).toEqual(['birthDate', 'departmentId', 'empNo', 'name', 'sex', 'siteId']);
    const f = { ...employeeToForm(record), email: 'bad', hireDate: '2026/1/1', nationalId: 'Z123' };
    expect(employeeFormProblems(f)).toEqual({ email: 'Email 格式不正確', hireDate: '日期格式不正確', nationalId: '身分證字號格式不正確' });
    expect(employeeFormProblems({ ...employeeToForm(record), nationalId: 'b223456789' })).toEqual({});
  });

  it('sends blanks as null, splits special operations and upper-cases the national ID', () => {
    const body = createEmployeeBody({ ...employeeToForm(record), title: ' ', specialOperations: '噪音，游離輻射、 ', nationalId: 'b223456789' });
    expect(body).toMatchObject({ title: null, specialOperations: ['噪音', '游離輻射'], nationalId: 'B223456789', hireDate: null });
  });

  it('updates only what changed, moves site and department together, and clears the national ID only when asked', () => {
    expect(updateEmployeeBody(record, employeeToForm(record))).toEqual({});
    expect(updateEmployeeBody(record, { ...employeeToForm(record), email: 'LIN@acme.test', specialOperations: '噪音、粉塵' })).toEqual({});
    expect(updateEmployeeBody(record, { ...employeeToForm(record), title: '', departmentId: 'd2', status: '離職' }))
      .toEqual({ title: null, siteId: 's1', departmentId: 'd2', status: '離職' });
    expect(updateEmployeeBody(record, { ...employeeToForm(record), clearNationalId: true })).toEqual({ nationalId: null });
    expect(updateEmployeeBody(record, { ...employeeToForm(record), nationalId: 'c123456789' })).toEqual({ nationalId: 'C123456789' });
  });
});
