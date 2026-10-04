import { describe, expect, it } from 'vitest';
import { accountFormProblems, accountToForm, countByRole, filterAccounts, inactiveCount, inviteBody, signInText, updateBody, type StaffAccount } from './accounts';

const account = (over: Partial<StaffAccount>): StaffAccount => ({
  id: 'u1', email: 'nurse@demo.test', name: '王護理師', role: '職護', phone: null, qualification: null, active: true,
  signedInBefore: false, lastSignInAt: null, siteIds: ['s1'], ...over,
});
const LIST = [
  account({}),
  account({ id: 'u2', email: 'HR@demo.test', name: '李人資', role: '人資', siteIds: ['s2'] }),
  account({ id: 'u3', email: 'old@demo.test', name: '張舊', role: '職護', active: false, siteIds: [] }),
];

describe('staff account helpers', () => {
  it('filters by name or email (any case), role, site and status', () => {
    expect(filterAccounts(LIST, { q: 'hr@' }).map(a => a.id)).toEqual(['u2']);
    expect(filterAccounts(LIST, { q: '王' }).map(a => a.id)).toEqual(['u1']);
    expect(filterAccounts(LIST, { role: '職護' }).map(a => a.id)).toEqual(['u1', 'u3']);
    expect(filterAccounts(LIST, { siteId: 's2' }).map(a => a.id)).toEqual(['u2']);
    expect(filterAccounts(LIST, { active: false }).map(a => a.id)).toEqual(['u3']);
    expect(filterAccounts(LIST, { active: null })).toHaveLength(3);
  });

  it('counts active accounts per role in role order, and the deactivated ones', () => {
    expect(countByRole(LIST).slice(0, 4)).toEqual([{ role: '職護', active: 1 }, { role: '職醫', active: 0 }, { role: '職安衛人員', active: 0 }, { role: '人資', active: 1 }]);
    expect(inactiveCount(LIST)).toBe(1);
  });

  it('needs a name, a valid email for invitations, and a site for care staff', () => {
    const f = { ...accountToForm(account({})), name: ' ', email: 'not-an-email', siteIds: [] };
    expect(accountFormProblems(f, { isNew: true, isSelf: false })).toEqual({ name: '請填寫姓名', email: '請填寫正確的 Email', siteIds: '職護至少要負責一個廠區' });
    // A deactivated nurse may keep no site; HR needs none.
    expect(accountFormProblems({ ...f, name: 'A', active: false }, { isNew: false, isSelf: false })).toEqual({});
    expect(accountFormProblems({ ...f, name: 'A', role: '人資' }, { isNew: false, isSelf: false })).toEqual({});
  });

  it('stops admins from changing their own role or deactivating themselves', () => {
    const me = account({ role: '租戶管理員', siteIds: [] });
    expect(accountFormProblems({ ...accountToForm(me), role: '人資', active: false }, { isNew: false, isSelf: true, original: me }))
      .toEqual({ role: '不能變更自己的角色', active: '不能停用自己' });
  });

  it('invites with trimmed text and empty optional fields as null', () => {
    expect(inviteBody({ name: ' 新人 ', email: ' a@b.co ', role: '人資', siteIds: ['s1'], phone: ' ', qualification: '', active: true }))
      .toEqual({ name: '新人', email: 'a@b.co', role: '人資', siteIds: ['s1'], phone: null, qualification: null });
  });

  it('sends only what changed', () => {
    const a = account({ siteIds: ['s1', 's2'], phone: '02-1' });
    expect(updateBody(a, accountToForm(a))).toEqual({});
    expect(updateBody(a, { ...accountToForm(a), siteIds: ['s2', 's1'] })).toEqual({});
    expect(updateBody(a, { ...accountToForm(a), phone: '', active: false, siteIds: ['s1'] })).toEqual({ phone: null, active: false, siteIds: ['s1'] });
  });

  it('shows the last sign-in, or why there is none', () => {
    expect(signInText({ lastSignInAt: null, signedInBefore: false })).toBe('尚未登入');
    expect(signInText({ lastSignInAt: null, signedInBefore: true })).toBe('已登入過');
    expect(signInText({ lastSignInAt: new Date(2026, 9, 4, 8, 5).toISOString(), signedInBefore: true })).toBe('2026/10/04 08:05');
  });
});
