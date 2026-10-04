/*
 * Plans (方案) where they are chosen: the plan picker, and a small manager to rename a plan or stop offering it
 * (PATCH /platform-api/plans/{id}). The code never changes. A deactivated plan can no longer be chosen for onboarding
 * or a new period; subscriptions already on it carry on.
 */
import { Button, Card, Group, Select, Stack, Switch, Text, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api, plansQuery, type Plan } from './api';
import { ErrorAlert, ToneBadge } from './components';
import { planProblems, planUpdate, type PlanForm, type PlanUpdate } from './forms';
import { useCan } from './permissions';

/**
 * Active plans to choose from. `value` stays listed even when deactivated, marked as such, so a form shows what is set
 * now. With `onManage`, roles that may change plans get a way to the manager.
 */
export function PlanSelect({ value, onChange, error, onManage }: {
  value: string;
  onChange: (code: string) => void;
  error?: string | false;
  onManage?: () => void;
}) {
  const plans = useQuery(plansQuery);
  const canManage = useCan('subscriptions:write') && !!onManage;
  const options = (plans.data ?? []).filter(p => p.active || p.code === value)
    .map(p => ({ value: p.code, label: p.active ? p.name : `${p.name}（已停用）` }));
  return (
    <Stack gap={4}>
      <Select label="方案" withAsterisk data={options} value={value || null} onChange={v => onChange(v ?? '')}
        placeholder={plans.isPending ? '載入方案中' : '選擇方案'} disabled={plans.isPending} allowDeselect={false} error={error}
        nothingFoundMessage="沒有啟用中的方案"
        inputContainer={input => (canManage ? (
          <Group gap="xs" wrap="nowrap">
            <div style={{ flex: 1, minWidth: 0 }}>{input}</div>
            <Button variant="subtle" onClick={onManage} style={{ flexShrink: 0 }}>管理方案</Button>
          </Group>
        ) : input)} />
      {plans.error && <ErrorAlert error={plans.error} />}
    </Stack>
  );
}

/** Every plan, active or not, each editable in place. */
export function PlanManager({ onBack }: { onBack?: () => void }) {
  const plans = useQuery(plansQuery);
  const [editing, setEditing] = useState<string | null>(null);
  return (
    <Stack gap="sm">
      {plans.error && <ErrorAlert error={plans.error} />}
      {plans.data?.length === 0 && <Text size="sm" c="dimmed">還沒有任何方案。</Text>}
      {plans.data?.map(p => (editing === p.id ? <PlanEditor key={p.id} plan={p} onClose={() => setEditing(null)} /> : (
        <Group key={p.id} justify="space-between" wrap="nowrap" gap="sm" py={4}>
          <div style={{ minWidth: 0 }}>
            <Text size="sm" fw={600}>{p.name}</Text>
            <Text size="xs" c="dimmed" ff="monospace">{p.code}</Text>
          </div>
          <Group gap="xs" wrap="nowrap">
            {p.active ? <ToneBadge tone="ok">啟用</ToneBadge> : <ToneBadge tone="neutral">已停用</ToneBadge>}
            <Button variant="subtle" size="compact-sm" onClick={() => setEditing(p.id)} disabled={editing != null}>編輯</Button>
          </Group>
        </Group>
      )))}
      <Text size="xs" c="dimmed">方案代碼不能修改。停用的方案不能再用於開通或新的訂閱期間，已在使用的訂閱不受影響。</Text>
      {onBack && <Group justify="flex-end"><Button variant="default" onClick={onBack}>返回</Button></Group>}
    </Stack>
  );
}

function PlanEditor({ plan, onClose }: { plan: Plan; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState<PlanForm>({ name: plan.name, active: plan.active });
  const [submitted, setSubmitted] = useState(false);
  const save = useMutation({
    mutationFn: (body: PlanUpdate) => data(api.PATCH('/platform-api/plans/{id}', { params: { path: { id: plan.id } }, body })),
    onSuccess: updated => {
      qc.setQueryData(plansQuery.queryKey, list => list?.map(p => (p.id === updated.id ? updated : p)));
      // Tenants show the plan's name.
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onClose();
    },
  });
  const problems = planProblems(form);
  const submit = () => {
    setSubmitted(true);
    if (Object.keys(problems).length) return;
    const body = planUpdate(plan, form);
    if (body) save.mutate(body);
    else onClose();
  };
  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="sm">
        <Text size="xs" c="dimmed" ff="monospace">{plan.code}</Text>
        <TextInput label="方案名稱" withAsterisk maxLength={100} data-autofocus value={form.name}
          onChange={e => { const name = e.currentTarget.value; setForm(f => ({ ...f, name })); }} error={submitted && problems.name} />
        <Switch label="啟用" description="停用後不能再用這個方案開通租戶或新增訂閱期間" checked={form.active}
          onChange={e => { const active = e.currentTarget.checked; setForm(f => ({ ...f, active })); }} />
        {save.error && <ErrorAlert error={save.error} />}
        <Group justify="flex-end" gap="sm">
          <Button variant="default" size="xs" onClick={onClose}>取消</Button>
          <Button size="xs" loading={save.isPending} onClick={submit}>儲存</Button>
        </Group>
      </Stack>
    </Card>
  );
}
