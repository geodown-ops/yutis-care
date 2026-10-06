import { Button, Card, Group, Modal, NumberInput, SegmentedControl, SimpleGrid, Stack, Table, Text, Textarea, TextInput, Title } from '@mantine/core';
import { IconSearch } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { ApiRequestError, data } from '@yutis/api-client';
import { TRIAL_EMPLOYEE_RANGE_LABELS, TRIAL_IDENTITY_PROVIDER_LABELS, type TrialEmployeeRange, type TrialIdentityProvider } from '@yutis/domain';
import { useState } from 'react';
import { api, plansQuery, tenantsQuery, trialApplicationsQuery, type TrialApplication, type TrialApplicationStatus } from '../api';
import { DangerButton, ErrorAlert, Footnote, LabelBadge, LoadError, PageLoader, ToneAlert } from '../components';
import { errorMessage } from '../errors';
import { formatDateTime, todayInTaipei } from '../format';
import { TRIAL_APPLICATION_STATUS } from '../labels';
import { AnchorLink } from '../links';
import { useCan } from '../permissions';
import { PlanSelect } from '../plans';
import { newTenantBody, newTenantProblems, normalizeSubdomain, tenantBaseDomain, type NewTenantForm } from '../tenants';
import { matchesApplication, trialToNewTenantForm } from '../trials';

export const Route = createFileRoute('/trial-applications')({ component: TrialApplicationsPage });

type Filter = TrialApplicationStatus | 'all';

function TrialApplicationsPage() {
  const { data: applications, error, refetch } = useQuery(trialApplicationsQuery);
  const [filter, setFilter] = useState<Filter>('pending');
  const [query, setQuery] = useState('');
  const [approving, setApproving] = useState<TrialApplication | null>(null);
  const [declining, setDeclining] = useState<TrialApplication | null>(null);
  const shown = applications?.filter(a => (filter === 'all' || a.status === filter) && matchesApplication(a, query));
  const pending = applications?.filter(a => a.status === 'pending').length ?? 0;

  return (
    <Stack gap="lg">
      <Title order={2}>試用申請</Title>
      <Text size="sm" c="dimmed">官網 care.yutis.net 送來的線上申請。開通後會建立租戶（試用），並寄第一次登入的邀請信給申請人。</Text>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !applications ? <PageLoader /> : (
        <Card>
          <Group justify="space-between" mb="sm">
            <SegmentedControl value={filter} onChange={v => setFilter(v as Filter)} data={[
              { value: 'pending', label: pending ? `待審核（${pending}）` : '待審核' },
              { value: 'approved', label: '已開通' },
              { value: 'declined', label: '已婉拒' },
              { value: 'all', label: '全部' },
            ]} />
            <TextInput aria-label="搜尋試用申請" placeholder="搜尋公司、統編、聯絡人或 Email" leftSection={<IconSearch size={16} />} w={300}
              value={query} onChange={e => setQuery(e.currentTarget.value)} />
          </Group>
          {shown && shown.length > 0
            ? <ApplicationTable applications={shown} onApprove={setApproving} onDecline={setDeclining} />
            : <Text c="dimmed" ta="center" py="lg">{applications.length === 0 ? '還沒有任何試用申請。' : '沒有符合條件的申請。'}</Text>}
        </Card>
      )}
      <Footnote>申請只含公司與聯絡人資料；未開通的申請保存一年後刪除。</Footnote>
      <Modal opened={!!approving} onClose={() => setApproving(null)} title="開通試用" centered radius="lg" size="lg">
        {approving && <ApproveForm application={approving} onClose={() => setApproving(null)} />}
      </Modal>
      <Modal opened={!!declining} onClose={() => setDeclining(null)} title="婉拒試用申請" centered radius="lg">
        {declining && <DeclineForm application={declining} onClose={() => setDeclining(null)} />}
      </Modal>
    </Stack>
  );
}

function ApplicationTable({ applications, onApprove, onDecline }: {
  applications: TrialApplication[];
  onApprove: (a: TrialApplication) => void;
  onDecline: (a: TrialApplication) => void;
}) {
  const canDecide = useCan('tenants:write');
  return (
    <Table.ScrollContainer minWidth={980}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th>公司</Table.Th><Table.Th>聯絡人</Table.Th><Table.Th>規模與帳號系統</Table.Th><Table.Th>申請時間</Table.Th><Table.Th>狀態</Table.Th>
            {canDecide && <Table.Th />}
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {applications.map(a => (
            <Table.Tr key={a.id}>
              <Table.Td>
                <Text fw={600} size="sm">{a.companyName}</Text>
                <Text size="xs" c="dimmed">統編 {a.taxId}{a.preferredSubdomain ? ` · 希望代碼 ${a.preferredSubdomain}` : ''}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{a.contactName}（{a.contactTitle}）</Text>
                <Text size="xs" c="dimmed">{a.email} · {a.phone}</Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm">{TRIAL_EMPLOYEE_RANGE_LABELS[a.employeeRange as TrialEmployeeRange] ?? a.employeeRange}</Text>
                <Text size="xs" c="dimmed">{a.identityProvider ? TRIAL_IDENTITY_PROVIDER_LABELS[a.identityProvider as TrialIdentityProvider] ?? a.identityProvider : '帳號系統未填'}</Text>
              </Table.Td>
              <Table.Td><Text size="sm">{formatDateTime(a.createdAt)}</Text></Table.Td>
              <Table.Td>
                <LabelBadge value={TRIAL_APPLICATION_STATUS[a.status]} />
                {a.status !== 'pending' && <Text size="xs" c="dimmed" mt={4}>{a.decidedBy} · {formatDateTime(a.decidedAt)}</Text>}
                {a.declineReason && <Text size="xs" c="dimmed">原因：{a.declineReason}</Text>}
                {a.tenantId && <AnchorLink to="/tenants/$tenantId" params={{ tenantId: a.tenantId }} size="xs">查看租戶</AnchorLink>}
              </Table.Td>
              {canDecide && (
                <Table.Td>
                  {a.status === 'pending' && (
                    <Group gap="xs" wrap="nowrap" justify="flex-end">
                      <Button size="xs" onClick={() => onApprove(a)}>開通</Button>
                      <Button size="xs" variant="default" onClick={() => onDecline(a)}>婉拒</Button>
                    </Group>
                  )}
                </Table.Td>
              )}
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Refresh everything a decision changes: the applications, and after 開通 the tenant list and usage. */
function useDecision<V>(mutationFn: (vars: V) => Promise<TrialApplication>, onDone: (a: TrialApplication) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: a => {
      void qc.invalidateQueries({ queryKey: ['trial-applications'] });
      if (a.tenantId) {
        void qc.invalidateQueries({ queryKey: ['tenants'], exact: true });
        void qc.invalidateQueries({ queryKey: ['usage'] });
      }
      onDone(a);
    },
  });
}

function ApproveForm({ application, onClose }: { application: TrialApplication; onClose: () => void }) {
  const navigate = useNavigate();
  const [form, setForm] = useState(() => trialToNewTenantForm(application, todayInTaipei()));
  const [submitted, setSubmitted] = useState(false);
  const plans = useQuery(plansQuery);
  const tenantDomain = tenantBaseDomain(useQuery(tenantsQuery).data, window.location.hostname);
  const activePlans = (plans.data ?? []).filter(p => p.active);
  const planCode = form.planCode || (activePlans.length === 1 ? activePlans[0]!.code : '');
  const values = { ...form, planCode };
  const problems = newTenantProblems(values);
  const set = <K extends keyof NewTenantForm>(k: K, v: NewTenantForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const err = (k: keyof NewTenantForm) => submitted && problems[k];
  const slug = normalizeSubdomain(form.subdomain);

  const approve = useDecision((f: NewTenantForm) => data(api.POST('/platform-api/trial-applications/{id}/approve', {
    params: { path: { id: application.id } }, body: newTenantBody(f),
  })), a => {
    onClose();
    if (a.tenantId) void navigate({ to: '/tenants/$tenantId', params: { tenantId: a.tenantId } });
  });
  const taken = approve.error instanceof ApiRequestError && approve.error.code === 'subdomain_taken';
  const submit = () => {
    setSubmitted(true);
    if (Object.keys(problems).length === 0) approve.mutate(values);
  };

  return (
    <Stack>
      <ToneAlert tone="info">會建立租戶（試用）、租戶金鑰與登入租戶，複製預設範本，再寄邀請信給下面的管理員。可以先調整再開通。</ToneAlert>
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput label="公司名稱" withAsterisk maxLength={100} value={form.name} onChange={e => set('name', e.currentTarget.value)} error={err('name')} />
        <TextInput label="子網域" withAsterisk maxLength={63} ff="monospace" autoCapitalize="off" spellCheck={false}
          description={tenantDomain ? `https://${slug || 'acme'}.${tenantDomain}` : undefined}
          value={form.subdomain} onChange={e => set('subdomain', e.currentTarget.value.toLowerCase())}
          error={(slug && problems.subdomain) || err('subdomain') || (taken && errorMessage(approve.error))} />
      </SimpleGrid>
      <PlanSelect value={planCode} onChange={v => set('planCode', v)} error={err('planCode')} />
      <SimpleGrid cols={{ base: 1, xs: 3 }}>
        <NumberInput label="人數上限" min={1} allowDecimal={false} allowNegative={false} value={form.seatLimit} onChange={v => set('seatLimit', v)} error={err('seatLimit')} />
        <TextInput type="date" label="試用開始" withAsterisk value={form.startsOn} onChange={e => set('startsOn', e.currentTarget.value)} error={err('startsOn')} />
        <TextInput type="date" label="試用結束" value={form.endsOn} onChange={e => set('endsOn', e.currentTarget.value)} error={err('endsOn')} />
      </SimpleGrid>
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput label="第一位管理員" withAsterisk maxLength={100} value={form.adminName} onChange={e => set('adminName', e.currentTarget.value)} error={err('adminName')} />
        <TextInput label="管理員 Email" type="email" withAsterisk value={form.adminEmail} onChange={e => set('adminEmail', e.currentTarget.value)} error={err('adminEmail')} />
      </SimpleGrid>
      {approve.error && !taken && <ErrorAlert error={approve.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={approve.isPending} onClick={submit}>開通試用</Button>
      </Group>
    </Stack>
  );
}

function DeclineForm({ application, onClose }: { application: TrialApplication; onClose: () => void }) {
  const [reason, setReason] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const decline = useDecision((r: string) => data(api.POST('/platform-api/trial-applications/{id}/decline', {
    params: { path: { id: application.id } }, body: { reason: r },
  })), onClose);
  const problem = reason.trim() ? undefined : '請說明婉拒原因';
  return (
    <Stack>
      <Text size="sm">婉拒 {application.companyName} 的試用申請。原因只記錄在平台內部，不會寄給申請人；需要通知對方時請另外聯絡。</Text>
      <Textarea label="婉拒原因" autosize minRows={3} maxLength={500} withAsterisk data-autofocus
        value={reason} onChange={e => setReason(e.currentTarget.value)} error={submitted && problem} />
      {decline.error && <ErrorAlert error={decline.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <DangerButton loading={decline.isPending} onClick={() => { setSubmitted(true); if (!problem) decline.mutate(reason.trim()); }}>婉拒</DangerButton>
      </Group>
    </Stack>
  );
}
