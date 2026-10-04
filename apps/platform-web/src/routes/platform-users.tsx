import { Button, Card, Group, Input, Modal, SegmentedControl, Stack, Switch, Table, Text, TextInput, Title } from '@mantine/core';
import { IconPlus } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api, platformUsersQuery, type PlatformRole, type PlatformUser } from '../api';
import { AuditLog } from '../AuditLog';
import { ErrorAlert, LoadError, PageLoader, ToneAlert, ToneBadge, useDialog } from '../components';
import { isForbidden } from '../errors';
import { platformUserProblems, type PlatformUserForm } from '../forms';
import { PLATFORM_ROLE_SUMMARY, PLATFORM_ROLES } from '../labels';
import { useCan } from '../permissions';

export const Route = createFileRoute('/platform-users')({ component: PlatformUsersPage });

function PlatformUsersPage() {
  const canManage = useCan('platform-users:manage');
  const canAudit = useCan('audit:read');
  return (
    <Stack gap="lg">
      {canManage ? <PlatformUserList /> : (
        <>
          <Title order={2}>平台帳號與稽核</Title>
          <Card>
            <Text fw={600} mb={4}>平台帳號</Text>
            <Text size="sm" c="dimmed">只有工程角色可以查看與管理平台帳號。需要新增或停用帳號時，請聯絡工程同仁。</Text>
          </Card>
        </>
      )}

      <Card>
        <Text fw={600} mb="sm">角色權限</Text>
        <Stack gap={8}>
          {PLATFORM_ROLES.map(r => (
            <Group key={r} gap="md" wrap="nowrap" align="baseline">
              <Text size="sm" fw={600} w={40}>{r}</Text>
              <Text size="sm" c="dimmed">{PLATFORM_ROLE_SUMMARY[r]}</Text>
            </Group>
          ))}
        </Stack>
        <Text size="xs" c="dimmed" mt="md">任何角色都看不到租戶的員工或健康資料。登入由 Identity-Aware Proxy 控管，這裡決定登入後的角色。</Text>
      </Card>

      {canAudit && <AuditLog />}
    </Stack>
  );
}

/** The platform's own staff accounts; only roles with platform-users:manage may list them. */
function PlatformUserList() {
  const { data: users, error, refetch } = useQuery(platformUsersQuery);
  const editor = useDialog<PlatformUser | 'new'>();

  return (
    <>
      <Group justify="space-between">
        <Title order={2}>平台帳號與稽核</Title>
        {users && <Button leftSection={<IconPlus size={16} />} onClick={() => editor.open('new')}>新增平台人員</Button>}
      </Group>
      {error ? (
        <LoadError error={error} onRetry={() => void refetch()} forbidden={isForbidden(error) ? '你的平台角色不能查看或管理平台帳號，目前只開放給工程角色。' : undefined} />
      ) : !users ? <PageLoader /> : (
        <Card>
          <Table.ScrollContainer minWidth={640}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>姓名</Table.Th><Table.Th>Email</Table.Th><Table.Th>角色</Table.Th><Table.Th>狀態</Table.Th><Table.Th aria-label="操作" /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {users.map(u => (
                  <Table.Tr key={u.id}>
                    <Table.Td fw={600}>{u.name}</Table.Td>
                    <Table.Td>{u.email}</Table.Td>
                    <Table.Td>{u.role}</Table.Td>
                    <Table.Td>{u.active ? <ToneBadge tone="ok">啟用</ToneBadge> : <ToneBadge tone="neutral">停用</ToneBadge>}</Table.Td>
                    <Table.Td ta="right"><Button variant="subtle" size="compact-sm" onClick={() => editor.open(u)}>編輯</Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        </Card>
      )}

      <Modal opened={editor.opened} onClose={editor.close} title={editor.target === 'new' ? '新增平台人員' : '編輯平台人員'} centered radius="lg">
        {editor.target && <PlatformUserEditor user={editor.target === 'new' ? null : editor.target} onClose={editor.close} />}
      </Modal>
    </>
  );
}

function PlatformUserEditor({ user, onClose }: { user: PlatformUser | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlatformUserForm>(() => ({ email: user?.email ?? '', name: user?.name ?? '', role: user?.role ?? '客服', active: user?.active ?? true }));
  const [submitted, setSubmitted] = useState(false);
  const save = useMutation({
    mutationFn: (f: PlatformUserForm) => user
      ? data(api.PATCH('/platform-api/platform-users/{id}', { params: { path: { id: user.id } }, body: { name: f.name.trim(), role: f.role, active: f.active } }))
      : data(api.POST('/platform-api/platform-users', { body: { email: f.email.trim().toLowerCase(), name: f.name.trim(), role: f.role } })),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: platformUsersQuery.queryKey }); onClose(); },
  });
  const problems = platformUserProblems(form, !user);
  const err = (k: keyof PlatformUserForm) => submitted && problems[k];
  const set = <K extends keyof PlatformUserForm>(k: K, v: PlatformUserForm[K]) => setForm(f => ({ ...f, [k]: v }));

  return (
    <Stack>
      {user
        ? <TextInput label="Email" value={user.email} readOnly variant="filled" />
        : <TextInput label="Email" type="email" withAsterisk description="Yutis 的 Google Workspace 帳號" value={form.email} onChange={e => set('email', e.currentTarget.value)} error={err('email')} />}
      <TextInput label="姓名" withAsterisk maxLength={100} value={form.name} onChange={e => set('name', e.currentTarget.value)} error={err('name')} />
      <Input.Wrapper label="角色" description={PLATFORM_ROLE_SUMMARY[form.role]} inputWrapperOrder={['label', 'input', 'description']}>
        <SegmentedControl fullWidth my={4} value={form.role} onChange={v => set('role', v as PlatformRole)} data={[...PLATFORM_ROLES]} />
      </Input.Wrapper>
      {user && <Switch label="啟用" description="停用後即使通過 Identity-Aware Proxy 也無法使用平台後台" checked={form.active} onChange={e => set('active', e.currentTarget.checked)} />}
      {!user && <ToneAlert tone="info">還需要在 Identity-Aware Proxy 加入這個帳號，對方才能登入。</ToneAlert>}
      {save.error && <ErrorAlert error={save.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setSubmitted(true); if (!Object.keys(problems).length) save.mutate(form); }}>{user ? '儲存' : '新增'}</Button>
      </Group>
    </Stack>
  );
}
