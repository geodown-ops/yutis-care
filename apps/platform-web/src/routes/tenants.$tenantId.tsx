import { Anchor, Button, Card, DataList, Group, List, SimpleGrid, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowLeft, IconCircleCheck, IconCircleDashed, IconExternalLink } from '@tabler/icons-react';
import { useQuery } from '@tanstack/react-query';
import { createFileRoute } from '@tanstack/react-router';
import { useState, type ReactNode } from 'react';
import { tenantQuery, type TenantDetail } from '../api';
import { DangerOutlineButton, Footnote, LabelBadge, LoadError, PageLoader, SeatBar, ToneAlert, ToneBadge } from '../components';
import { isMissingTenant } from '../errors';
import { formatCount, formatDate, formatDateTime, todayInTaipei } from '../format';
import { SUBSCRIPTION_STATUS, TENANT_STATUS } from '../labels';
import { AnchorLink } from '../links';
import { PaymentOrders } from '../payment-orders';
import { can, useMe } from '../permissions';
import { TenantDialogs, type TenantDialogKind } from '../tenant-dialogs';
import { currentPeriodIndex, pendingSetup } from '../tenants';

export const Route = createFileRoute('/tenants/$tenantId')({ component: TenantDetailPage });

function TenantDetailPage() {
  const { tenantId } = Route.useParams();
  const { data: tenant, error, refetch } = useQuery(tenantQuery(tenantId));
  return (
    <Stack gap="lg">
      <AnchorLink to="/" size="sm" c="dimmed" w="fit-content">
        <Group gap={4}><IconArrowLeft size={14} />租戶列表</Group>
      </AnchorLink>
      {error && isMissingTenant(error) ? (
        <Stack gap="xs">
          <Title order={2}>找不到這個租戶</Title>
          <Text c="dimmed">網址可能打錯了，或這個租戶已經不存在。</Text>
        </Stack>
      ) : error ? <LoadError error={error} onRetry={() => void refetch()} /> : !tenant ? <PageLoader /> : <TenantView tenant={tenant} />}
    </Stack>
  );
}

function TenantView({ tenant: t }: { tenant: TenantDetail }) {
  const [dialog, setDialog] = useState<TenantDialogKind | null>(null);
  const me = useMe();
  const pending = pendingSetup(t);
  const s = t.subscription;
  const today = todayInTaipei();
  const current = currentPeriodIndex(t.subscriptions, today);
  const canStatus = can(me, 'tenants:write');
  const canSubscribe = can(me, 'subscriptions:write');
  return (
    <>
      <Group justify="space-between" align="flex-start" gap="md">
        <Stack gap={4}>
          <Group gap="sm"><Title order={2}>{t.name}</Title><LabelBadge value={TENANT_STATUS[t.status]} /></Group>
          <Anchor href={t.url} target="_blank" rel="noreferrer" size="sm" ff="monospace" w="fit-content">
            <Group gap={4} wrap="nowrap">{t.url.replace(/^https?:\/\//, '')}<IconExternalLink size={14} /></Group>
          </Anchor>
        </Stack>
        {t.status !== 'closed' && (canStatus || canSubscribe) && (
          <Group gap="sm">
            {canSubscribe && (s
              ? <>
                <Button variant="default" onClick={() => setDialog('renew')}>續約／新期間</Button>
                <Button variant="default" onClick={() => setDialog('subscription')}>更正目前訂閱</Button>
              </>
              : <Button variant="default" onClick={() => setDialog('subscription')}>設定訂閱</Button>)}
            {canStatus && t.status === 'active' && <DangerOutlineButton onClick={() => setDialog('suspend')}>停用租戶</DangerOutlineButton>}
            {canStatus && t.status === 'suspended' && <Button onClick={() => setDialog('reactivate')}>恢復啟用</Button>}
          </Group>
        )}
      </Group>

      {t.status === 'suspended' && <ToneAlert tone="warn" title="這個租戶已停用">租戶的後台與員工端目前都無法使用，資料仍保留。</ToneAlert>}
      {pending.length > 0 && (
        <ToneAlert tone="warn" title="開通尚未完成">
          <List size="sm" spacing={2}>{pending.map(p => <List.Item key={p}>{p}</List.Item>)}</List>
        </ToneAlert>
      )}

      <SimpleGrid cols={{ base: 1, md: 3 }} spacing="lg">
        <Card>
          <CardTitle>目前訂閱</CardTitle>
          {s ? (
            <DataList labelWidth={88} gap={10}>
              <Row label="方案">{s.planName}</Row>
              <Row label="狀態"><LabelBadge value={SUBSCRIPTION_STATUS[s.status]} /></Row>
              <Row label="人數上限">{s.seatLimit == null ? '不限' : `${formatCount(s.seatLimit)} 人`}</Row>
              <Row label="期間">{formatDate(s.startsOn)} 起{s.endsOn ? `，至 ${formatDate(s.endsOn)}` : '，未設結束日'}</Row>
            </DataList>
          ) : <Text size="sm" c="dimmed">尚未設定訂閱。</Text>}
        </Card>
        <Card>
          <CardTitle>人數</CardTitle>
          <Text size="xs" c="dimmed" mb={4}>在職員工／人數上限</Text>
          <SeatBar activeEmployees={t.activeEmployees} seatLimit={s?.seatLimit ?? null} w="100%" />
          {t.overSeatLimit && s?.seatLimit != null && (
            <Text size="xs" c="var(--yutis-bad)" mt={6}>超過上限 {formatCount(t.activeEmployees - s.seatLimit)} 人，只提醒、不阻擋使用。</Text>
          )}
          <DataList labelWidth={88} gap={10} mt="md">
            <Row label="後台帳號">{formatCount(t.staffAccounts)} 個</Row>
          </DataList>
        </Card>
        <Card>
          <CardTitle>開通狀態</CardTitle>
          <Stack gap={10}>
            <Ready ok={t.encryptionKeyReady}>租戶金鑰（Cloud KMS）</Ready>
            <Ready ok={t.signInTenantReady}>登入租戶（Identity Platform）</Ready>
          </Stack>
          <Text size="xs" c="dimmed" mt="md">建立於 {formatDate(t.createdAt)}</Text>
        </Card>
      </SimpleGrid>

      <Card>
        <CardTitle>租戶管理員</CardTitle>
        {t.admins.length === 0 ? <Text size="sm" c="dimmed">沒有租戶管理員。</Text> : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>姓名</Table.Th><Table.Th>Email</Table.Th><Table.Th>狀態</Table.Th><Table.Th>最近登入</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {t.admins.map(a => (
                  <Table.Tr key={a.email}>
                    <Table.Td fw={600}>{a.name}</Table.Td>
                    <Table.Td>{a.email}</Table.Td>
                    <Table.Td>{a.active ? <ToneBadge tone="ok">啟用</ToneBadge> : <ToneBadge tone="neutral">停用</ToneBadge>}</Table.Td>
                    <Table.Td>{a.lastSignInAt ? formatDateTime(a.lastSignInAt) : <Text span size="sm" c="dimmed">尚未登入</Text>}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Card>
        <CardTitle>訂閱紀錄</CardTitle>
        {t.subscriptions.length === 0 ? <Text size="sm" c="dimmed">還沒有訂閱紀錄。</Text> : (
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th>方案</Table.Th><Table.Th>狀態</Table.Th><Table.Th>人數上限</Table.Th><Table.Th>開始日</Table.Th><Table.Th>結束日</Table.Th></Table.Tr></Table.Thead>
              <Table.Tbody>
                {t.subscriptions.map((h, i) => (
                  <Table.Tr key={`${h.startsOn}-${i}`}>
                    <Table.Td>
                      <Group gap={8}>
                        {h.planName}
                        {i === current ? <Text span size="xs" c="dimmed">目前</Text> : h.startsOn > today && <Text span size="xs" c="dimmed">尚未開始</Text>}
                      </Group>
                    </Table.Td>
                    <Table.Td><LabelBadge value={SUBSCRIPTION_STATUS[h.status]} /></Table.Td>
                    <Table.Td>{h.seatLimit == null ? '不限' : formatCount(h.seatLimit)}</Table.Td>
                    <Table.Td>{formatDate(h.startsOn)}</Table.Td>
                    <Table.Td>{formatDate(h.endsOn)}</Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Card>

      <Card>
        <PaymentOrders tenant={t} canWrite={canSubscribe} />
      </Card>

      <Footnote>員工數與帳號數由資料庫函式計算，平台看不到任何員工明細。</Footnote>
      <TenantDialogs tenant={t} open={dialog} onClose={() => setDialog(null)} />
    </>
  );
}

const CardTitle = ({ children }: { children: ReactNode }) => <Text fw={600} mb="sm">{children}</Text>;

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <DataList.Item>
    <DataList.ItemLabel c="dimmed">{label}</DataList.ItemLabel>
    <DataList.ItemValue>{children}</DataList.ItemValue>
  </DataList.Item>
);

function Ready({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <Group gap={8} wrap="nowrap">
      {ok ? <IconCircleCheck size={18} color="var(--yutis-ok)" aria-hidden /> : <IconCircleDashed size={18} color="var(--yutis-warn)" aria-hidden />}
      <Text size="sm" style={{ flex: 1 }}>{children}</Text>
      <Text size="xs" c={ok ? 'var(--yutis-ok)' : 'var(--yutis-warn)'} fw={600}>{ok ? '完成' : '待處理'}</Text>
    </Group>
  );
}
