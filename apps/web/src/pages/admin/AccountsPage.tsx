import { ActionIcon, Alert, Badge, Button, Card, CopyButton, Group, Modal, MultiSelect, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconMailCheck, IconMailOff, IconSearch, IconSend, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data, STAFF_ROLES, type IdentityPlatformConfig, type StaffRole } from '@yutis/api-client';
import { sendEmailLinkTo, signInProblem } from '@yutis/sign-in';
import { StatCard, type TileTone } from '@yutis/ui';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useMe, useTenant } from '../../session';
import { CardNote } from '../states';
import {
  accountFormProblems, accountToForm, countByRole, emptyAccountForm, filterAccounts, inactiveCount, inviteBody, inviteNotice, signInText, SITE_ROLES, updateBody,
  type AccountForm, type InvitedStaff, type StaffAccount,
} from './accounts';
import { siteNames, siteOptions, type LegalEntity } from './org';
import { orgQuery, staffAccountsQuery } from './queries';
import { AdminTitle, ErrorNote, FormActions, ToneBadge } from './ui';

/** What each role can see (ROLE_ACCESS in apps/api/src/auth/permissions.ts), in plain words. */
const ROLE_HINT: Record<StaffRole, string> = {
  職護: '負責廠區員工的健檢、個案、協助紀錄與各計畫資料。',
  職醫: '負責廠區員工的健檢、個案、協助紀錄與各計畫資料。',
  職安衛人員: '職業衛生計畫、勞工健康服務與去識別統計，看不到健檢數值與病歷。',
  人資: '員工資料、工作安排建議與去識別統計，看不到健檢數值與病歷。',
  部門主管: '自己部門的員工與給主管的工作安排建議。',
  租戶管理員: '租戶設定、組織、帳號與員工主檔，看不到任何健康資料。',
};
const TILES: TileTone[] = ['lavender', 'blue', 'mint', 'pink'];
const CARE: readonly StaffRole[] = ['職護', '職醫'];

type Status = 'active' | 'inactive' | 'all';

/** 帳號與權限: back-office staff, their role and responsible sites. Only invited people can sign in. */
export function AccountsPage() {
  const me = useMe();
  const tenant = useTenant();
  // Sign-in links come from the tenant's email-link sign-in, so they work even where the system sends no email.
  const linkSignIn = tenant.loginMethods.includes('email_otp') ? tenant.identityPlatform : null;
  const { data: accounts } = useSuspenseQuery(staffAccountsQuery);
  const { data: tree } = useSuspenseQuery(orgQuery);
  const [q, setQ] = useState('');
  const [role, setRole] = useState<StaffRole | null>(null);
  const [siteId, setSiteId] = useState<string | null>(null);
  const [status, setStatus] = useState<Status>('active');
  const [editing, setEditing] = useState<StaffAccount | 'new' | null>(null);
  const rows = filterAccounts(accounts, { q, role, siteId, active: status === 'all' ? null : status === 'active' });

  return (
    <Stack gap="lg">
      <AdminTitle title="帳號與權限"
        description="只有在這裡邀請的人能登入後台。角色決定看得到哪些功能與資料，負責廠區決定看得到哪些員工。停用會立即登出，舊紀錄仍保留原本的人名。"
        actions={<Button leftSection={<IconUserPlus size={16} />} onClick={() => setEditing('new')}>邀請人員</Button>} />

      <Card>
        <SimpleGrid cols={{ base: 2, sm: 4, lg: 7 }} spacing="sm">
          {countByRole(accounts).map((c, i) => <StatCard key={c.role} tone={TILES[i % TILES.length]} label={c.role} value={c.active} />)}
          <StatCard tone="pink" label="已停用" value={inactiveCount(accounts)} />
        </SimpleGrid>
      </Card>

      <Card>
        <Group gap="sm" mb="md" wrap="wrap">
          <TextInput aria-label="以姓名或 Email 搜尋" placeholder="姓名或 Email" leftSection={<IconSearch size={16} />} w={220} value={q} onChange={e => setQ(e.currentTarget.value)} />
          <Select aria-label="角色" placeholder="全部角色" clearable w={150} data={[...STAFF_ROLES]} value={role} onChange={v => setRole(v as StaffRole | null)} />
          <Select aria-label="負責廠區" placeholder="全部廠區" clearable w={170} data={siteOptions(tree)} value={siteId} onChange={setSiteId} />
          <SegmentedControl aria-label="狀態" value={status} onChange={v => setStatus(v as Status)}
            data={[{ value: 'active', label: '啟用' }, { value: 'inactive', label: '停用' }, { value: 'all', label: '全部' }]} />
          <Text size="sm" c="dimmed" ml="auto">共 {rows.length} 人</Text>
        </Group>
        <Table.ScrollContainer minWidth={1240}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead>
              <Table.Tr><Table.Th>姓名</Table.Th><Table.Th>角色</Table.Th><Table.Th>Email</Table.Th><Table.Th>電話</Table.Th><Table.Th>負責廠區</Table.Th><Table.Th>資格／證照</Table.Th><Table.Th>登入</Table.Th><Table.Th>狀態</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {rows.map(a => {
                const sites = siteNames(tree, a.siteIds);
                return (
                  <Table.Tr key={a.id}>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap"><Text fw={600} size="sm">{a.name}</Text>{a.id === me.id && <Badge size="sm" color="yutis" variant="light">目前登入</Badge>}</Group>
                    </Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}><ToneBadge tone={CARE.includes(a.role) ? 'info' : 'muted'}>{a.role}</ToneBadge></Table.Td>
                    <Table.Td ff="monospace" fz="sm">{a.email}</Table.Td>
                    <Table.Td fz="sm" c={a.phone ? undefined : 'dimmed'}>{a.phone ?? '—'}</Table.Td>
                    <Table.Td fz="sm" c={sites.length ? undefined : 'dimmed'}>{sites.join('、') || '—'}</Table.Td>
                    <Table.Td fz="sm" c={a.qualification ? undefined : 'dimmed'} maw={220}>{a.qualification ?? '—'}</Table.Td>
                    <Table.Td fz="sm" c={a.lastSignInAt ? undefined : 'dimmed'} style={{ whiteSpace: 'nowrap' }}>{signInText(a)}</Table.Td>
                    <Table.Td style={{ whiteSpace: 'nowrap' }}>{a.active ? <ToneBadge tone="ok">啟用</ToneBadge> : <ToneBadge tone="muted">停用</ToneBadge>}</Table.Td>
                    <Table.Td>
                      <Group gap={6} wrap="nowrap" justify="flex-end">
                        {linkSignIn && a.active && <SendLinkButton cfg={linkSignIn} account={a} />}
                        <Button size="compact-sm" variant="default" onClick={() => setEditing(a)} aria-label={`編輯 ${a.name}`}>編輯</Button>
                      </Group>
                    </Table.Td>
                  </Table.Tr>
                );
              })}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {rows.length === 0 && <CardNote>沒有符合條件的人員。</CardNote>}
      </Card>

      <Modal opened={!!editing} onClose={() => setEditing(null)} title={editing === 'new' ? '邀請人員' : editing ? `編輯人員 · ${editing.name}` : ''} size="lg">
        {editing && <AccountFormView key={editing === 'new' ? 'new' : editing.id} account={editing === 'new' ? null : editing} tree={tree} isSelf={editing !== 'new' && editing.id === me.id} onDone={() => setEditing(null)} />}
      </Modal>
    </Stack>
  );
}

/** Why the system did not send the link itself, so the admin knows the email came from Google (in English). */
const NOT_SENT_TEXT: Record<string, string> = {
  email_not_configured: '系統寄信服務尚未設定',
  no_email_link: '這個租戶的 Email 登入無法由系統產生連結',
  link_refused: '系統尚未取得產生登入連結的權限',
};

/**
 * Emails a member a one-time sign-in link to this site's login page. The system sends it from its own address when it
 * can (POST …/sign-in-link); otherwise the sign-in service sends its own email.
 */
function SendLinkButton({ cfg, account }: { cfg: IdentityPlatformConfig; account: StaffAccount }) {
  const send = useMutation({
    mutationFn: async (): Promise<string | null> => {
      const result = await data(api.POST('/api/admin/users/{id}/sign-in-link', { params: { path: { id: account.id } } }));
      if (result.sent) return null;
      await sendEmailLinkTo(cfg, account.email, `${window.location.origin}/login`);
      return NOT_SENT_TEXT[result.reason ?? ''] ?? '系統無法寄出';
    },
  });
  // signInProblem reads both the API's 429 and the sign-in service's own rate limit.
  const failed = send.isError ? (signInProblem(send.error) === 'tooMany' ? '剛剛才寄過，請稍後再試' : '寄送失敗，請再試一次') : null;
  const viaGoogle = send.isSuccess ? send.data : null;
  const label = failed ?? (viaGoogle ? `已由 Google 寄出英文登入信到 ${account.email}（${viaGoogle}）`
    : send.isSuccess ? `已寄到 ${account.email}` : `寄一次性登入連結到 ${account.email}`);
  return (
    <Tooltip label={label} withArrow multiline maw={320}>
      <Button size="compact-sm" variant="light" color={failed ? 'red' : viaGoogle ? 'yellow' : send.isSuccess ? 'green' : undefined}
        leftSection={send.isSuccess ? <IconCheck size={14} /> : <IconSend size={14} />} loading={send.isPending}
        onClick={() => send.mutate()} aria-label={`重新寄發登入連結給 ${account.name}`}>
        {viaGoogle ? '已寄出（Google）' : send.isSuccess ? '已寄出' : '重新寄發登入連結'}
      </Button>
    </Tooltip>
  );
}

function AccountFormView({ account, tree, isSelf, onDone }: { account: StaffAccount | null; tree: LegalEntity[]; isSelf: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<AccountForm>(() => (account ? accountToForm(account) : emptyAccountForm()));
  const [tried, setTried] = useState(false);
  const problems = accountFormProblems(f, { isNew: !account, isSelf, original: account ?? undefined });
  const changes = account ? updateBody(account, f) : null;
  // After an invitation the modal says whether it was emailed, instead of closing.
  const [invited, setInvited] = useState<InvitedStaff | null>(null);
  const save = useMutation({
    mutationFn: async (): Promise<InvitedStaff | null> => {
      if (!account) return data(api.POST('/api/admin/users', { body: inviteBody(f) }));
      await data(api.PATCH('/api/admin/users/{id}', { params: { path: { id: account.id } }, body: updateBody(account, f) }));
      return null;
    },
    onSuccess: async result => {
      await qc.invalidateQueries({ queryKey: ['admin', 'users'] });
      if (result) setInvited(result); else onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) save.mutate();
  };
  const show = (k: keyof AccountForm) => (tried ? problems[k] : undefined);
  const text = (k: 'name' | 'email' | 'phone' | 'qualification') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });
  if (invited) return <InviteResult invited={invited} onDone={onDone} />;

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        {!account && (
          <Text size="sm" c="dimmed">
            系統會寄邀請信到這個 Email，內含登入網址 {window.location.origin}；對方第一次以這個 Email 登入時完成綁定。
          </Text>
        )}
        <Group grow align="flex-start">
          <TextInput label="姓名" required value={f.name} onChange={text('name')} maxLength={100} error={show('name')} data-autofocus />
          <TextInput label="Email" required={!account} type="email" value={f.email} onChange={text('email')} disabled={!!account} error={show('email')}
            description={account ? '登入帳號，不能修改' : undefined} />
        </Group>
        <Select label="角色" required data={[...STAFF_ROLES]} value={f.role} onChange={v => v && setF({ ...f, role: v as StaffRole })} allowDeselect={false}
          disabled={isSelf} description={isSelf ? '不能變更自己的角色' : ROLE_HINT[f.role]} error={show('role')} />
        {f.role === '租戶管理員' ? (
          <Text size="sm" c="dimmed">租戶管理員看不到員工健康資料，不需要負責廠區。</Text>
        ) : (
          <MultiSelect label="負責廠區" data={siteOptions(tree)} value={f.siteIds} onChange={v => setF({ ...f, siteIds: v })} searchable clearable
            required={SITE_ROLES.includes(f.role)} error={show('siteIds')}
            description="只看得到負責廠區的員工。" placeholder={f.siteIds.length ? undefined : '選擇廠區'} />
        )}
        <Group grow align="flex-start">
          <TextInput label="電話" value={f.phone} onChange={text('phone')} maxLength={40} />
          <TextInput label="資格／證照" value={f.qualification} onChange={text('qualification')} maxLength={200} placeholder="例如 勞工健康服務護理人員訓練合格" />
        </Group>
        {account && (
          <Switch label="啟用" checked={f.active} onChange={e => setF({ ...f, active: e.currentTarget.checked })} disabled={isSelf}
            description={isSelf ? '不能停用自己' : !f.active && account.active ? '儲存後會立即登出，且不能再登入。' : undefined} />
        )}
        <ErrorNote error={save.error} />
        <FormActions busy={save.isPending} onCancel={onDone} submitLabel={account ? '儲存' : '邀請'} disabled={!!changes && Object.keys(changes).length === 0} />
      </Stack>
    </form>
  );
}

/** After inviting: the invitation was emailed, or it was not and the admin copies the sign-in address to pass on. */
function InviteResult({ invited, onDone }: { invited: InvitedStaff; onDone: () => void }) {
  const notice = inviteNotice(invited);
  const url = `${window.location.origin}/`;
  return (
    <Stack gap="md">
      <Alert color={notice.sent ? 'green' : 'yellow'} variant="light" title={notice.title}
        icon={notice.sent ? <IconMailCheck size={18} /> : <IconMailOff size={18} />}>
        {notice.text}
      </Alert>
      {!notice.sent && (
        <TextInput label="登入網址" readOnly value={url} onFocus={e => e.currentTarget.select()} styles={{ input: { fontFamily: 'monospace' } }}
          rightSection={(
            <CopyButton value={url}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? '已複製' : '複製登入網址'} withArrow>
                  <ActionIcon variant="subtle" color={copied ? 'green' : 'gray'} onClick={copy} aria-label="複製登入網址">
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          )} />
      )}
      <Group justify="flex-end"><Button onClick={onDone} data-autofocus>完成</Button></Group>
    </Stack>
  );
}
