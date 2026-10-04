/*
 * The tenant detail page's actions: suspend, reactivate, a new subscription period (續約、換方案) and correcting the
 * current one. Each answers with the new detail. The forms sit inside the modal, which unmounts them on close, so
 * every opening starts from the current tenant.
 */
import { Button, Group, Input, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState, type ReactNode } from 'react';
import { api, plansQuery, type TenantDetail } from './api';
import { DangerButton, ErrorAlert, ToneAlert } from './components';
import { formatDate, todayInTaipei } from './format';
import type { Problems } from './forms';
import { SUBSCRIPTION_STATUS, SUBSCRIPTION_STATUSES } from './labels';
import { PlanManager, PlanSelect } from './plans';
import {
  latestPeriodNewEnd, newPeriodProblems, newPeriodToForm, subscriptionBody, subscriptionProblems, subscriptionToForm, type SubscriptionForm,
} from './tenants';

export type TenantDialogKind = 'suspend' | 'reactivate' | 'subscription' | 'renew';

/** The open dialog, if any. */
export function TenantDialogs({ tenant, open, onClose }: { tenant: TenantDetail; open: TenantDialogKind | null; onClose: () => void }) {
  const props = { tenant, onClose };
  return (
    <>
      <Modal opened={open === 'suspend'} onClose={onClose} title="停用租戶" centered radius="lg"><SuspendForm {...props} /></Modal>
      <Modal opened={open === 'reactivate'} onClose={onClose} title="恢復啟用" centered radius="lg"><ReactivateForm {...props} /></Modal>
      <Modal opened={open === 'subscription'} onClose={onClose} title={tenant.subscription ? '更正目前訂閱' : '設定訂閱'} centered radius="lg" size="lg">
        <SubscriptionFormView {...props} />
      </Modal>
      <Modal opened={open === 'renew'} onClose={onClose} title="續約／新期間" centered radius="lg" size="lg">
        <NewPeriodView {...props} />
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

/** PUT /platform-api/tenants/{id}/subscription: corrects the current period in place (or adds the first one). */
function SubscriptionFormView({ tenant, onClose }: FormProps) {
  const [form, setForm] = useState(() => subscriptionToForm(tenant.subscription, todayInTaipei()));
  const save = useTenantAction(tenant.id, (f: SubscriptionForm) =>
    data(api.PUT('/platform-api/tenants/{id}/subscription', { params: { path: { id: tenant.id } }, body: subscriptionBody(f) })), onClose);
  return (
    <PeriodFields form={form} setForm={setForm} problems={subscriptionProblems(form)} save={save} onClose={onClose} saveLabel="儲存"
      intro={tenant.subscription
        ? '直接修改目前這一期，用來更正錯誤，不會留下紀錄。續約或換方案請用「續約／新期間」，訂閱紀錄才會保留。目前不會依此收費。'
        : '這個租戶還沒有訂閱，儲存後會新增一筆。目前不會依此收費。'} />
  );
}

/** POST /platform-api/tenants/{id}/subscriptions: a new period after the latest, which stays in the history. */
function NewPeriodView({ tenant, onClose }: FormProps) {
  const latest = tenant.subscriptions[0] ?? null;
  const [form, setForm] = useState(() => newPeriodToForm(latest, todayInTaipei()));
  const plans = useQuery(plansQuery);
  const save = useTenantAction(tenant.id, (f: SubscriptionForm) =>
    data(api.POST('/platform-api/tenants/{id}/subscriptions', { params: { path: { id: tenant.id } }, body: subscriptionBody(f) })), onClose);
  const problems = newPeriodProblems(form, latest, plans.data?.filter(p => p.active).map(p => p.code) ?? null);
  const closes = latestPeriodNewEnd(latest, form.startsOn);
  return (
    <PeriodFields form={form} setForm={setForm} problems={problems} save={save} onClose={onClose} saveLabel="新增這一期"
      intro="新增一期訂閱，之前的期間會留在訂閱紀錄。開始日一到就成為目前的訂閱，所以可以在這一期結束前先續約。目前不會依此收費。"
      note={closes && latest && (
        <ToneAlert tone="info">最近一期（{latest.planName}，{formatDate(latest.startsOn)} 起）的結束日會改為 {formatDate(closes)}。</ToneAlert>
      )} />
  );
}

/** The fields both subscription forms share, and a way to the plan manager without losing what was typed. */
function PeriodFields({ form, setForm, problems, save, onClose, saveLabel, intro, note }: {
  form: SubscriptionForm;
  setForm: (update: (f: SubscriptionForm) => SubscriptionForm) => void;
  problems: Problems<SubscriptionForm>;
  save: { mutate: (f: SubscriptionForm) => void; isPending: boolean; error: unknown };
  onClose: () => void;
  saveLabel: string;
  intro: string;
  note?: ReactNode;
}) {
  const [submitted, setSubmitted] = useState(false);
  const [managing, setManaging] = useState(false);
  const err = (k: keyof SubscriptionForm) => submitted && problems[k];
  const set = <K extends keyof SubscriptionForm>(k: K, v: SubscriptionForm[K]) => setForm(f => ({ ...f, [k]: v }));

  if (managing) {
    return (
      <Stack>
        <Text fw={600}>方案</Text>
        <PlanManager onBack={() => setManaging(false)} />
      </Stack>
    );
  }
  return (
    <Stack>
      <Text size="sm" c="dimmed">{intro}</Text>
      <PlanSelect value={form.planCode} onChange={v => set('planCode', v)} error={err('planCode')} onManage={() => setManaging(true)} />
      <Input.Wrapper label="訂閱狀態" withAsterisk>
        <SegmentedControl fullWidth mt={4} value={form.status} onChange={v => set('status', v as SubscriptionForm['status'])}
          data={SUBSCRIPTION_STATUSES.map(s => ({ value: s, label: SUBSCRIPTION_STATUS[s].label }))} />
      </Input.Wrapper>
      <NumberInput label="人數上限" description="超過只提醒、不阻擋；不限人數請留空" min={1} allowDecimal={false} allowNegative={false} thousandSeparator
        value={form.seatLimit} onChange={v => set('seatLimit', v)} error={err('seatLimit')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput type="date" label="開始日" description="這一期訂閱生效的日期" withAsterisk value={form.startsOn} onChange={e => set('startsOn', e.currentTarget.value)} error={err('startsOn')} />
        <TextInput type="date" label="結束日" description="不設結束日請留空" value={form.endsOn} onChange={e => set('endsOn', e.currentTarget.value)} error={err('endsOn')} />
      </SimpleGrid>
      {note}
      {!!save.error && <ErrorAlert error={save.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={save.isPending} onClick={() => { setSubmitted(true); if (!Object.keys(problems).length) save.mutate(form); }}>{saveLabel}</Button>
      </Group>
    </Stack>
  );
}
