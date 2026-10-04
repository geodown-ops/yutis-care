import { Button, Card, Group, Input, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Text, TextInput, Title } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ApiRequestError, data } from '@yutis/api-client';
import { useState, type ReactNode } from 'react';
import { api, plansQuery, tenantsQuery } from '../api';
import { ErrorAlert, LoadError, ToneAlert } from '../components';
import { errorMessage } from '../errors';
import { todayInTaipei } from '../format';
import { SUBSCRIPTION_STATUS } from '../labels';
import { ButtonLink } from '../links';
import { useCan } from '../permissions';
import { PlanManager, PlanSelect } from '../plans';
import { emptyNewTenantForm, newTenantBody, newTenantProblems, normalizeSubdomain, tenantBaseDomain, type NewTenantForm } from '../tenants';

export const Route = createFileRoute('/tenants/new')({ component: NewTenantPage });

function NewTenantPage() {
  if (useCan('tenants:write')) return <NewTenantForm />;
  return (
    <Stack gap="lg" maw={760}>
      <Title order={2}>新增租戶</Title>
      <LoadError error={null} onRetry={() => {}} forbidden="你的平台角色不能開通租戶，目前只開放給營運角色。" />
    </Stack>
  );
}

function NewTenantForm() {
  const qc = useQueryClient();
  const [managingPlans, setManagingPlans] = useState(false);
  const navigate = useNavigate();
  const [form, setForm] = useState(() => emptyNewTenantForm(todayInTaipei()));
  const [submitted, setSubmitted] = useState(false);
  const plans = useQuery(plansQuery);
  // Only for the address preview; the API builds the real URL from its own setting.
  const tenantDomain = tenantBaseDomain(useQuery(tenantsQuery).data, window.location.hostname);
  const activePlans = (plans.data ?? []).filter(p => p.active);
  const planCode = form.planCode || (activePlans.length === 1 ? activePlans[0]!.code : '');

  const onboard = useMutation({
    mutationFn: (f: NewTenantForm) => data(api.POST('/platform-api/tenants', { body: newTenantBody(f) })),
    onSuccess: created => {
      qc.setQueryData(['tenants', created.id], created);
      void qc.invalidateQueries({ queryKey: ['tenants'], exact: true });
      void qc.invalidateQueries({ queryKey: ['usage'] });
      void navigate({ to: '/tenants/$tenantId', params: { tenantId: created.id } });
    },
  });

  const values = { ...form, planCode };
  // A plan deactivated from the plan manager while this form was open.
  const planInactive = !!planCode && !!plans.data && !activePlans.some(p => p.code === planCode);
  const problems = { ...newTenantProblems(values), ...(planInactive ? { planCode: '這個方案已停用，請選擇其他方案' } : {}) };
  const set = <K extends keyof NewTenantForm>(k: K, v: NewTenantForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const err = (k: keyof NewTenantForm) => submitted && problems[k];
  const slug = normalizeSubdomain(form.subdomain);
  const taken = onboard.error instanceof ApiRequestError && onboard.error.code === 'subdomain_taken';
  // The subdomain is checked as it is typed; other fields once the form has been sent.
  const subdomainError = (slug && problems.subdomain) || err('subdomain') || (taken && errorMessage(onboard.error));

  const submit = () => {
    setSubmitted(true);
    if (Object.keys(problems).length === 0) onboard.mutate(values);
  };

  return (
    <Stack gap="lg" maw={760}>
      <Title order={2}>新增租戶</Title>
      <ToneAlert tone="info">
        開通時會建立租戶金鑰（Cloud KMS）、登入租戶（Identity Platform）與訂閱，複製預設範本，再寄邀請信給第一位租戶管理員。任何一步失敗，已建立的部分都會取消。
      </ToneAlert>

      <Section title="公司">
        <TextInput label="公司名稱" withAsterisk maxLength={100} value={form.name} onChange={e => set('name', e.currentTarget.value)} error={err('name')} />
        <TextInput label="子網域" withAsterisk maxLength={63} ff="monospace" autoCapitalize="off" autoCorrect="off" spellCheck={false}
          description={tenantDomain ? `租戶網址：https://${slug || 'acme'}.${tenantDomain}` : '子網域是租戶網址的第一段'}
          value={form.subdomain} onChange={e => set('subdomain', e.currentTarget.value.toLowerCase())} error={subdomainError} />
      </Section>

      <Section title="訂閱">
        <PlanSelect value={planCode} onChange={v => set('planCode', v)} error={err('planCode')} onManage={() => setManagingPlans(true)} />
        <Input.Wrapper label="訂閱狀態" withAsterisk>
          <div>
            <SegmentedControl mt={4} value={form.subscriptionStatus} onChange={v => set('subscriptionStatus', v as NewTenantForm['subscriptionStatus'])}
              data={(['trial', 'active'] as const).map(s => ({ value: s, label: SUBSCRIPTION_STATUS[s].label }))} />
          </div>
        </Input.Wrapper>
        <NumberInput label="人數上限" description="超過只提醒、不阻擋；不限人數請留空" min={1} allowDecimal={false} allowNegative={false} thousandSeparator maw={240}
          value={form.seatLimit} onChange={v => set('seatLimit', v)} error={err('seatLimit')} />
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput type="date" label="開始日" description="預設為今天" withAsterisk value={form.startsOn} onChange={e => set('startsOn', e.currentTarget.value)} error={err('startsOn')} />
          <TextInput type="date" label="結束日" description="不設結束日請留空" value={form.endsOn} onChange={e => set('endsOn', e.currentTarget.value)} error={err('endsOn')} />
        </SimpleGrid>
      </Section>

      <Section title="第一位租戶管理員" note="開通後會寄邀請信到這個 Email，用來登入租戶後台。">
        <SimpleGrid cols={{ base: 1, xs: 2 }}>
          <TextInput label="姓名" withAsterisk maxLength={100} value={form.adminName} onChange={e => set('adminName', e.currentTarget.value)} error={err('adminName')} />
          <TextInput label="Email" type="email" withAsterisk value={form.adminEmail} onChange={e => set('adminEmail', e.currentTarget.value)} error={err('adminEmail')} />
        </SimpleGrid>
      </Section>

      {onboard.error && !taken && <ErrorAlert error={onboard.error} />}
      <Group justify="flex-end">
        <ButtonLink to="/" variant="default">取消</ButtonLink>
        <Button loading={onboard.isPending} onClick={submit}>開通租戶</Button>
      </Group>
      <Modal opened={managingPlans} onClose={() => setManagingPlans(false)} title="方案" centered radius="lg">
        <PlanManager onBack={() => setManagingPlans(false)} />
      </Modal>
    </Stack>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return (
    <Card>
      <Text fw={600}>{title}</Text>
      {note && <Text size="sm" c="dimmed">{note}</Text>}
      <Stack gap="md" mt="md">{children}</Stack>
    </Card>
  );
}
