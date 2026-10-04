import { Badge, Button, Card, Group, Modal, MultiSelect, SegmentedControl, Select, SimpleGrid, Stack, Switch, Table, Text, TextInput } from '@mantine/core';
import { IconSearch, IconUserPlus } from '@tabler/icons-react';
import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data, STAFF_ROLES, type StaffRole } from '@yutis/api-client';
import { StatCard, type TileTone } from '@yutis/ui';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { useMe } from '../../session';
import { CardNote } from '../states';
import {
  accountFormProblems, accountToForm, countByRole, emptyAccountForm, filterAccounts, inactiveCount, inviteBody, signInText, SITE_ROLES, updateBody,
  type AccountForm, type StaffAccount,
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
        <Table.ScrollContainer minWidth={1080}>
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
                    <Table.Td><Button size="compact-sm" variant="default" onClick={() => setEditing(a)} aria-label={`編輯 ${a.name}`}>編輯</Button></Table.Td>
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

function AccountFormView({ account, tree, isSelf, onDone }: { account: StaffAccount | null; tree: LegalEntity[]; isSelf: boolean; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<AccountForm>(() => (account ? accountToForm(account) : emptyAccountForm()));
  const [tried, setTried] = useState(false);
  const problems = accountFormProblems(f, { isNew: !account, isSelf, original: account ?? undefined });
  const changes = account ? updateBody(account, f) : null;
  const save = useMutation({
    mutationFn: () => account
      ? data(api.PATCH('/api/admin/users/{id}', { params: { path: { id: account.id } }, body: updateBody(account, f) }))
      : data(api.POST('/api/admin/users', { body: inviteBody(f) })),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: ['admin', 'users'] }); onDone(); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setTried(true);
    if (Object.keys(problems).length === 0) save.mutate();
  };
  const show = (k: keyof AccountForm) => (tried ? problems[k] : undefined);
  const text = (k: 'name' | 'email' | 'phone' | 'qualification') => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.currentTarget.value });

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        {!account && (
          <Text size="sm" c="dimmed">
            系統會寄邀請信到這個 Email，內含登入網址 {window.location.origin}；對方第一次以這個 Email 登入時完成綁定。對方沒收到信時（測試與示範環境不會實際寄出），請直接把登入網址告訴對方。
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
