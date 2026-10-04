/*
 * The tenant detail page's actions: suspend, reactivate and change the subscription. Each answers with the new detail.
 * The forms sit inside the modal, which unmounts them on close, so every opening starts from the current tenant.
 */
import { Button, Group, Input, Modal, NumberInput, SegmentedControl, Select, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api, plansQuery, type TenantDetail } from './api';
import { DangerButton, ErrorAlert } from './components';
import { todayInTaipei } from './format';
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUSES } from './labels';
import { subscriptionBody, subscriptionProblems, subscriptionToForm, type SubscriptionForm } from './tenants';

export type TenantDialogKind = 'suspend' | 'reactivate' | 'subscription';

/** The open dialog, if any. */
export function TenantDialogs({ tenant, open, onClose }: { tenant: TenantDetail; open: TenantDialogKind | null; onClose: () => void }) {
  const props = { tenant, onClose };
  return (
    <>
      <Modal opened={open === 'suspend'} onClose={onClose} title="停用租戶" centered radius="lg"><SuspendForm {...props} /></Modal>
      <Modal opened={open === 'reactivate'} onClose={onClose} title="恢復啟用" centered radius="lg"><ReactivateForm {...props} /></Modal>
      <Modal opened={open === 'subscription'} onClose={onClose} title={tenant.subscription ? '變更訂閱' : '設定訂閱'} centered radius="lg" size="lg">
        <SubscriptionFormView {...props} />
      </Modal>
    </>
  );
}

interface FormProps { tenant: TenantDetail; onClose: () => void }

/** Runs a tenant action, then shows its result wherever the tenant appears. */
function useTenantAction<V>(tenantId: string, action: (vars: V) => Promise<TenantDetail>, onDone: () => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: detail => {
      qc.setQueryData(['tenants', tenantId], detail);
      void qc.invalidateQueries({ queryKey: ['tenants'], exact: true });
      void qc.invalidateQueries({ queryKey: ['usage'] });
      onDone();
    },
  });
}

function SuspendForm({ tenant, onClose }: FormProps) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const suspend = useTenantAction(tenant.id, (r: string) =>
    data(api.POST('/platform-api/tenants/{id}/suspend', { params: { path: { id: tenant.id } }, body: { reason: r } })), onClose);
  const problem = reason.trim() ? undefined : '請說明停用原因';
  return (
    <Stack>
      <Text size="sm">停用後，{tenant.name}的後台與員工端會立即無法使用。資料會保留，之後可以恢復啟用。</Text>
      <Textarea label="停用原因" description="會記錄在平台稽核紀錄" autosize minRows={3} maxLength={500} withAsterisk data-autofocus
        value={reason} onChange={e => setReason(e.currentTarget.value)} error={submitted && problem} />
      {suspend.error && <ErrorAlert error={suspend.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <DangerButton loading={suspend.isPending} onClick={() => { setSubmitted(true); if (!problem) suspend.mutate(reason.trim()); }}>停用租戶</DangerButton>
      </Group>
    </Stack>
  );
}

function ReactivateForm({ tenant, onClose }: FormProps) {
  const reactivate = useTenantAction(tenant.id, () =>
    data(api.POST('/platform-api/tenants/{id}/reactivate', { params: { path: { id: tenant.id } } })), onClose);
  return (
    <Stack>
      <Text size="sm">恢復後，{tenant.name}的後台與員工端會立即可以使用。</Text>
      {reactivate.error && <ErrorAlert error={reactivate.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={reactivate.isPending} onClick={() => reactivate.mutate(undefined)}>恢復啟用</Button>
      </Group>
    </Stack>
  );
}

function SubscriptionFormView({ tenant, onClose }: FormProps) {
  const [form, setForm] = useState(() => subscriptionToForm(tenant.subscription, todayInTaipei()));
  const [submitted, setSubmitted] = useState(false);
  const plans = useQuery(plansQuery);
  const save = useTenantAction(tenant.id, (f: SubscriptionForm) =>
    data(api.PUT('/platform-api/tenants/{id}/subscription', { params: { path: { id: tenant.id } }, body: subscriptionBody(f) })), onClose);
  const problems = subscriptionProblems(form);
  const err = (k: keyof SubscriptionForm) => submitted && problems[k];
  const set = <K extends keyof SubscriptionForm>(k: K, v: SubscriptionForm[K]) => setForm(f => ({ ...f, [k]: v }));
  // Only active plans can be chosen; the current one stays listed so the form shows what is set now.
  const planOptions = (plans.data ?? []).filter(p => p.active || p.code === form.planCode)
    .map(p => ({ value: p.code, label: p.active ? p.name : `${p.name}（已停用）` }));

  return (
    <Stack>
      <Text size="sm" c="dimmed">{tenant.subscription ? '更新目前這一期的訂閱。' : '這個租戶還沒有訂閱，儲存後會新增一筆。'}目前不會依此收費。</Text>
      <Select label="方案" withAsterisk data={planOptions} value={form.planCode || null} onChange={v => set('planCode', v ?? '')}
        placeholder={plans.isPending ? '載入方案中' : '選擇方案'} disabled={plans.isPending} allowDeselect={false} error={err('planCode')} />
      {plans.error && <ErrorAlert error={plans.error} />}
      <Input.Wrapper label="訂閱狀態" withAsterisk>
        <SegmentedControl fullWidth mt={4} value={form.status} onChange={v => set('status', v as SubscriptionForm['status'])}
          data={SUBSCRIPTION_STATUSES.map(s => ({ value: s, label: SUBSCRIPTION_STATUS[s].label }))} />
      </Input.Wrapper>
      <NumberInput label="人數上限" description="超過只提醒、不阻擋；不限人數請留空" min={1} allowDecimal={false} allowNegative={false} thousandSeparator
        value={form.seatLimit} onChange={v => set('seatLimit', v)} error={err('seatLimit')} />
      <SimpleGrid cols={2}>
        <TextInput type="date" label="開始日" description="這一期訂閱生效的日期" withAsterisk value={form.startsOn} onChange={e => set('startsOn', e.currentTarget.value)} error={err('startsOn')} />
        <TextInput type="date" label="結束日" description="不設結束日請留空" value={form.endsOn} onChange={e => set('endsOn', e.currentTarget.value)} error={err('endsOn')} />
      </SimpleGrid>
      {save.error && <ErrorAlert error={save.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setSubmitted(true); if (!Object.keys(problems).length) save.mutate(form); }}>儲存</Button>
      </Group>
    </Stack>
  );
}
