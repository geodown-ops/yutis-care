import { ActionIcon, Alert, Button, Card, Group, Skeleton, Stack, Text, TextInput } from '@mantine/core';
import { IconArrowDown, IconArrowUp, IconPlus, IconX } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { CardNote, problemText } from '../states';
import { signOffRolesQuery } from './queries';
import { moveItem, sameList, SIGN_OFF_ROLE_LENGTH, SIGN_OFF_ROLES_MAX, signOffRoleProblems } from './signoff';
import { ErrorNote } from './ui';

/** 簽核角色: the roles a signer on 附表八 or a violence-prevention review can be given, in the order they are offered. */
export function SignOffRolesPanel() {
  const saved = useQuery(signOffRolesQuery);
  if (saved.isPending) return <Card maw={720}><Skeleton h={320} /></Card>;
  if (saved.isError) return <Card maw={720}><CardNote>{problemText(saved.error)}</CardNote></Card>;
  return <SignOffRolesEditor saved={saved.data} />;
}

function SignOffRolesEditor({ saved }: { saved: string[] }) {
  const qc = useQueryClient();
  const [roles, setRoles] = useState<string[]>(saved);
  const [adding, setAdding] = useState('');
  const [done, setDone] = useState(false);
  const problems = signOffRoleProblems(roles);
  const changed = !sameList(roles, saved);
  const save = useMutation({
    mutationFn: () => data(api.PUT('/api/admin/sign-off-roles', { body: { roles: roles.map(r => r.trim()) } })),
    onSuccess: stored => { qc.setQueryData(signOffRolesQuery.queryKey, stored); setRoles(stored); setDone(true); },
  });
  const edit = (next: string[]) => { setRoles(next); setDone(false); save.reset(); };
  const add = (e: FormEvent) => {
    e.preventDefault();
    if (adding.trim()) { edit([...roles, adding.trim()]); setAdding(''); }
  };

  return (
    <Card maw={720}>
      <Text fw={600} size="lg" mb={4}>簽核角色</Text>
      <Text size="sm" c="dimmed" mb="md">
        填寫勞工健康服務執行紀錄表（附表八）與不法侵害預防措施查核時，每位簽核人員要選一個角色。清單依這裡的順序顯示；修改後，已建立的紀錄保留原本的角色。
      </Text>
      <Stack gap={6}>
        {roles.map((r, i) => (
          <Group key={i} gap={6} wrap="nowrap">
            <Text size="sm" c="dimmed" w={24} ta="right" ff="monospace">{i + 1}</Text>
            <TextInput aria-label={`第 ${i + 1} 個角色`} value={r} maxLength={SIGN_OFF_ROLE_LENGTH} style={{ flex: 1 }}
              onChange={e => edit(roles.map((x, j) => (j === i ? e.currentTarget.value : x)))} />
            <ActionIcon variant="subtle" color="gray" aria-label={`上移 ${r}`} disabled={i === 0} onClick={() => edit(moveItem(roles, i, -1))}><IconArrowUp size={16} /></ActionIcon>
            <ActionIcon variant="subtle" color="gray" aria-label={`下移 ${r}`} disabled={i === roles.length - 1} onClick={() => edit(moveItem(roles, i, 1))}><IconArrowDown size={16} /></ActionIcon>
            <ActionIcon variant="subtle" color="gray" aria-label={`移除 ${r}`} onClick={() => edit(roles.filter((_, j) => j !== i))}><IconX size={16} /></ActionIcon>
          </Group>
        ))}
      </Stack>
      <form onSubmit={add}>
        <Group gap="sm" mt="sm" align="flex-end">
          <TextInput aria-label="新增角色" placeholder="新增角色，例如 環境安全衛生主管" value={adding} onChange={e => setAdding(e.currentTarget.value)}
            maxLength={SIGN_OFF_ROLE_LENGTH} style={{ flex: '1 1 240px' }} disabled={roles.length >= SIGN_OFF_ROLES_MAX} />
          <Button type="submit" variant="default" leftSection={<IconPlus size={16} />} disabled={!adding.trim() || roles.length >= SIGN_OFF_ROLES_MAX}>加入</Button>
        </Group>
      </form>
      {problems.length > 0 && <Alert color="red" variant="light" p="xs" mt="sm"><Stack gap={2}>{problems.map(p => <Text key={p} size="sm">{p}</Text>)}</Stack></Alert>}
      <Stack gap="sm" mt="md">
        <ErrorNote error={save.error} />
        <Group justify="flex-end" gap="sm">
          {done && !changed && <Text size="sm" c="var(--yutis-ok)" fw={600} role="status">已儲存</Text>}
          <Button variant="default" disabled={!changed || save.isPending} onClick={() => edit(saved)}>還原</Button>
          <Button loading={save.isPending} disabled={!changed || problems.length > 0} onClick={() => save.mutate()}>儲存</Button>
        </Group>
      </Stack>
    </Card>
  );
}
