import { ApiRequestError } from '@yutis/api-client';
import { describe, expect, it } from 'vitest';
import {
  copyForm, countByStatus, filterRecords, formErrors, formFromRecord, newForm, readContent, serviceProblem, signProgress, timeRange, toBody, usedValues,
  type ServiceRecord, type Signature,
} from './records';

const ME = { id: 'u-me', name: '王護理師', email: 'nurse@demo.test' };

const sig = (role: string, signedAt: string | null = null): Signature =>
  ({ id: `s-${role}`, role, name: `${role}人`, email: `${role}@x.test`, sentAt: null, signedAt, comment: null });

const record = (id: string, status: ServiceRecord['status'], serviceOn: string, extra: Partial<ServiceRecord> = {}): ServiceRecord => ({
  id, status, serviceOn, siteId: 'site-1', siteName: '桃園廠',
  content: {
    from: '09:00', to: '12:00', executorUserId: 'u-other', unit: '示範科技', departmentName: '製造一課',
    headcount: { adminM: 1, adminF: 2, opM: 3, opF: 4, general: 5 }, special: [{ category: '噪音作業', count: 6 }],
    workplace: '二', services: '三', findings: '四', followUp: '五',
  },
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
    expect(body.content).toEqual(r.content);
    expect(body.signers).toEqual([
      { role: '勞工健康服務醫師', name: '勞工健康服務醫師人', email: '勞工健康服務醫師@x.test' },
      { role: '職業安全衛生人員', name: '職業安全衛生人員人', email: '職業安全衛生人員@x.test' },
    ]);
  });

  it('copies content and signers to a new draft dated today, executed by me', () => {
    const f = copyForm(record('a', '已完成', '2026-09-01'), '2026-10-04', 'u-me');
    expect(f.serviceOn).toBe('2026-10-04');
    expect(f.executorUserId).toBe('u-me');
    expect(f.special).toEqual([{ category: '噪音作業', count: 6 }]);
    expect(f.signers).toHaveLength(2);
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
  const list = [record('a', '草稿', '2026-09-20'), record('b', '簽核中', '2026-08-01', { siteId: 'site-2' }), record('c', '已完成', '2026-07-15')];

  it('counts per status and sign-off progress', () => {
    expect(countByStatus(list)).toEqual({ 草稿: 1, 簽核中: 1, 已完成: 1 });
    expect(signProgress(list[0]!.signatures)).toEqual({ signed: 1, total: 2 });
  });

  it('filters by status, site and an inclusive date range', () => {
    expect(filterRecords(list, {}).map(r => r.id)).toEqual(['a', 'b', 'c']);
    expect(filterRecords(list, { status: '簽核中' }).map(r => r.id)).toEqual(['b']);
    expect(filterRecords(list, { siteId: 'site-1' }).map(r => r.id)).toEqual(['a', 'c']);
    expect(filterRecords(list, { from: '2026-08-01', to: '2026-09-20' }).map(r => r.id)).toEqual(['a', 'b']);
  });

  it('suggests values already used, once each', () => {
    expect(usedValues(list, r => r.signatures.map(s => s.role))).toEqual(['勞工健康服務醫師', '職業安全衛生人員'].sort((a, b) => a.localeCompare(b, 'zh-Hant')));
    expect(usedValues([], () => [])).toEqual([]);
  });
});

describe('serviceProblem', () => {
  it('explains API error codes in plain words', () => {
    expect(serviceProblem(new ApiRequestError(400, 'unknown_sign_off_role', ''))).toContain('簽核角色');
    expect(serviceProblem(new ApiRequestError(409, 'not_draft', ''))).toContain('不能再修改');
    expect(serviceProblem(new ApiRequestError(403, 'forbidden', ''))).toContain('角色');
    expect(serviceProblem(new Error('offline'))).toContain('網路');
  });
});
