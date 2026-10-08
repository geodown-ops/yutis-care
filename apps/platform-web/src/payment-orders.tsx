/*
 * The tenant page's payment orders (付款單): create one and email its payment link, copy or resend the link, cancel it,
 * or mark a bank transfer paid. Card payments arrive by themselves through the marketing site's payment page, and
 * paying adds the order's subscription period.
 */
import { ActionIcon, Button, Checkbox, CopyButton, Group, Menu, Modal, NumberInput, SimpleGrid, Stack, Table, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy, IconDots } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { api, paymentOrdersQuery, plansQuery, type PaymentOrder, type TenantDetail } from './api';
import { DangerButton, ErrorAlert, LabelBadge, LoadError, ToneAlert } from './components';
import { formatCount, formatDate, formatDateTime, todayInTaipei } from './format';
import { PlanSelect } from './plans';
import { formatTwd, paidWith, paymentOrderBody, paymentOrderLabel, paymentOrderProblems, paymentOrderToForm, type PaymentOrderForm } from './payments';

type Action = { kind: 'create' } | { kind: 'cancel' | 'mark-paid'; order: PaymentOrder };

/** Runs a payment order action, then refreshes the orders and the tenant (a payment adds a subscription period). */
function useOrderAction<V>(tenantId: string, action: (vars: V) => Promise<PaymentOrder>, onDone: (order: PaymentOrder) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: action,
    onSuccess: order => {
      void qc.invalidateQueries({ queryKey: ['payment-orders', tenantId] });
      void qc.invalidateQueries({ queryKey: ['tenants'] });
      onDone(order);
    },
  });
}

export function PaymentOrders({ tenant, canWrite }: { tenant: TenantDetail; canWrite: boolean }) {
  const orders = useQuery(paymentOrdersQuery(tenant.id));
  const [action, setAction] = useState<Action | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const close = () => setAction(null);
  const resend = useOrderAction(tenant.id, (id: string) =>
    data(api.POST('/platform-api/payment-orders/{id}/email', { params: { path: { id } } })),
  o => setNotice(o.emailSent ? `付款通知信已重寄到 ${o.payerEmail}。` : '付款通知信沒有寄出，請複製連結另外傳給付款人。'));

  return (
    <Stack gap="sm">
      <Group justify="space-between" align="center">
        <Text fw={600}>付款單</Text>
        {canWrite && tenant.status !== 'closed' && <Button size="xs" variant="default" onClick={() => { setNotice(null); setAction({ kind: 'create' }); }}>建立付款單</Button>}
      </Group>
      {notice && <ToneAlert tone="info">{notice}</ToneAlert>}
      {resend.error && <ErrorAlert error={resend.error} />}
      {orders.error ? <LoadError error={orders.error} onRetry={() => void orders.refetch()} />
        : !orders.data ? <Text size="sm" c="dimmed">載入中…</Text>
        : orders.data.length === 0 ? <Text size="sm" c="dimmed">還沒有付款單。建立後，付款人可以從官網的付款頁以信用卡付款。</Text> : (
          <Table.ScrollContainer minWidth={760}>
            <Table verticalSpacing="sm">
              <Table.Thead>
                <Table.Tr><Table.Th>付款單號</Table.Th><Table.Th>項目</Table.Th><Table.Th>金額</Table.Th><Table.Th>狀態</Table.Th><Table.Th>付款</Table.Th><Table.Th aria-label="操作" /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {orders.data.map(o => (
                  <Table.Tr key={o.id}>
                    <Table.Td ff="monospace" fz="sm">{o.orderNumber}</Table.Td>
                    <Table.Td>
                      <Text size="sm">{o.description}</Text>
                      <Text size="xs" c="dimmed">付款聯絡人 {o.payerName}（{o.payerEmail}）</Text>
                    </Table.Td>
                    <Table.Td fw={600}>{formatTwd(o.amount)}</Table.Td>
                    <Table.Td><LabelBadge value={paymentOrderLabel(o)} /></Table.Td>
                    <Table.Td>
                      {o.status === 'paid' ? (
                        <>
                          <Text size="sm">{formatDateTime(o.paidAt)}</Text>
                          <Text size="xs" c="dimmed">{paidWith(o)}</Text>
                          {!o.subscriptionAdded && <Text size="xs" c="var(--yutis-warn)">訂閱期間未自動新增，請用「續約／新期間」補上</Text>}
                        </>
                      ) : o.status === 'pending' ? <Text size="sm" c="dimmed">期限 {formatDate(o.expiresOn)}</Text> : null}
                    </Table.Td>
                    <Table.Td>
                      {o.status === 'pending' && (
                        <Group gap={4} wrap="nowrap" justify="flex-end">
                          <CopyButton value={o.payUrl} timeout={1500}>
                            {({ copied, copy }) => (
                              <Tooltip label={copied ? '已複製' : '複製付款連結'} withArrow>
                                <ActionIcon variant="subtle" color="gray" onClick={copy} aria-label="複製付款連結">
                                  {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                                </ActionIcon>
                              </Tooltip>
                            )}
                          </CopyButton>
                          {canWrite && (
                            <Menu position="bottom-end" withinPortal>
                              <Menu.Target><ActionIcon variant="subtle" color="gray" aria-label="更多操作"><IconDots size={16} /></ActionIcon></Menu.Target>
                              <Menu.Dropdown>
                                <Menu.Item onClick={() => { setNotice(null); resend.mutate(o.id); }}>重寄付款通知信</Menu.Item>
                                <Menu.Item onClick={() => setAction({ kind: 'mark-paid', order: o })}>標記已付款（匯款）</Menu.Item>
                                <Menu.Item color="red" onClick={() => setAction({ kind: 'cancel', order: o })}>取消付款單</Menu.Item>
                              </Menu.Dropdown>
                            </Menu>
                          )}
                        </Group>
                      )}
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}

      <Modal opened={action?.kind === 'create'} onClose={close} title="建立付款單" centered radius="lg" size="lg">
        <CreateOrder tenant={tenant} onClose={close} onCreated={o => setNotice(o.emailSent === false
          ? `付款單 ${o.orderNumber} 已建立，但付款通知信沒有寄出，請複製連結另外傳給付款人。`
          : o.emailSent ? `付款單 ${o.orderNumber} 已建立，付款通知信已寄到 ${o.payerEmail}。` : `付款單 ${o.orderNumber} 已建立，請複製付款連結傳給付款人。`)} />
      </Modal>
      <Modal opened={action?.kind === 'cancel'} onClose={close} title="取消付款單" centered radius="lg">
        {action?.kind === 'cancel' && <CancelOrder tenantId={tenant.id} order={action.order} onClose={close} />}
      </Modal>
      <Modal opened={action?.kind === 'mark-paid'} onClose={close} title="標記已付款" centered radius="lg">
        {action?.kind === 'mark-paid' && <MarkPaid tenantId={tenant.id} order={action.order} onClose={close} />}
      </Modal>
    </Stack>
  );
}

function CreateOrder({ tenant, onClose, onCreated }: { tenant: TenantDetail; onClose: () => void; onCreated: (o: PaymentOrder) => void }) {
  const today = todayInTaipei();
  const [form, setForm] = useState(() => paymentOrderToForm(tenant, today));
  const [submitted, setSubmitted] = useState(false);
  const plans = useQuery(plansQuery);
  const latest = tenant.subscriptions[0] ?? null;
  const problems = paymentOrderProblems(form, latest, today);
  const create = useOrderAction(tenant.id, (f: PaymentOrderForm) =>
    data(api.POST('/platform-api/payment-orders', { body: paymentOrderBody(tenant.id, f) })), o => { onCreated(o); onClose(); });
  const err = (k: keyof PaymentOrderForm) => submitted && problems[k];
  const set = <K extends keyof PaymentOrderForm>(k: K, v: PaymentOrderForm[K]) => setForm(f => ({ ...f, [k]: v }));
  const plan = plans.data?.find(p => p.code === form.planCode);
  return (
    <Stack>
      <Text size="sm" c="dimmed">付款人可以從付款連結以信用卡付款，或匯款後由營運標記已付款。付款後會自動新增這一期訂閱（狀態為啟用）。</Text>
      <PlanSelect value={form.planCode} onChange={v => set('planCode', v)} error={err('planCode')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <NumberInput label="人數上限" description="不限人數請留空" min={1} allowDecimal={false} allowNegative={false} thousandSeparator
          value={form.seatLimit} onChange={v => set('seatLimit', v)} error={err('seatLimit')} />
        <NumberInput label="金額（新台幣）" withAsterisk min={1} allowDecimal={false} allowNegative={false} thousandSeparator prefix="NT$"
          value={form.amount} onChange={v => set('amount', v)} error={err('amount')} />
        <TextInput type="date" label="訂閱開始日" withAsterisk value={form.startsOn} onChange={e => set('startsOn', e.currentTarget.value)} error={err('startsOn')} />
        <TextInput type="date" label="訂閱結束日" description="不設結束日請留空" value={form.endsOn} onChange={e => set('endsOn', e.currentTarget.value)} error={err('endsOn')} />
      </SimpleGrid>
      <TextInput label="項目說明" description={`顯示在付款頁與刷卡紀錄；留空則為「${plan?.name ?? '方案'} 期間，人數」`} maxLength={80}
        value={form.description} onChange={e => set('description', e.currentTarget.value)} error={err('description')} />
      <SimpleGrid cols={{ base: 1, xs: 2 }}>
        <TextInput label="付款聯絡人" withAsterisk maxLength={50} value={form.payerName} onChange={e => set('payerName', e.currentTarget.value)} error={err('payerName')} />
        <TextInput label="付款聯絡人 Email" withAsterisk type="email" value={form.payerEmail} onChange={e => set('payerEmail', e.currentTarget.value)} error={err('payerEmail')} />
        <TextInput type="date" label="付款期限" withAsterisk description="過了這天付款頁就不能付款" value={form.expiresOn} onChange={e => set('expiresOn', e.currentTarget.value)} error={err('expiresOn')} />
      </SimpleGrid>
      <Checkbox label="寄付款通知信給付款聯絡人" checked={form.sendEmail} onChange={e => set('sendEmail', e.currentTarget.checked)} />
      {create.error && <ErrorAlert error={create.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={create.isPending} onClick={() => { setSubmitted(true); if (!Object.keys(problems).length) create.mutate(form); }}>
          建立付款單{form.amount !== '' && Number(form.amount) > 0 ? ` ${formatTwd(Number(form.amount))}` : ''}
        </Button>
      </Group>
    </Stack>
  );
}

function CancelOrder({ tenantId, order, onClose }: { tenantId: string; order: PaymentOrder; onClose: () => void }) {
  const cancel = useOrderAction(tenantId, () =>
    data(api.POST('/platform-api/payment-orders/{id}/cancel', { params: { path: { id: order.id } } })), onClose);
  return (
    <Stack>
      <Text size="sm">取消付款單 {order.orderNumber}（{formatTwd(order.amount)}）後，付款連結就不能再付款。</Text>
      {cancel.error && <ErrorAlert error={cancel.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>返回</Button>
        <DangerButton loading={cancel.isPending} onClick={() => cancel.mutate(undefined)}>取消付款單</DangerButton>
      </Group>
    </Stack>
  );
}

function MarkPaid({ tenantId, order, onClose }: { tenantId: string; order: PaymentOrder; onClose: () => void }) {
  const [note, setNote] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const mark = useOrderAction(tenantId, (n: string) =>
    data(api.POST('/platform-api/payment-orders/{id}/mark-paid', { params: { path: { id: order.id } }, body: { note: n } })), onClose);
  const problem = note.trim() ? undefined : '請記下入帳資訊，例如匯款帳號末五碼與日期';
  return (
    <Stack>
      <Text size="sm">確認已收到 {formatTwd(order.amount)} 的匯款後再標記。標記後會新增這一期訂閱（{order.planName}，{order.seatLimit == null ? '不限人數' : `${formatCount(order.seatLimit)} 人`}），並寄付款完成信給 {order.payerEmail}。</Text>
      <TextInput label="入帳備註" withAsterisk maxLength={200} data-autofocus value={note} onChange={e => setNote(e.currentTarget.value)} error={submitted && problem} />
      {mark.error && <ErrorAlert error={mark.error} />}
      <Group justify="flex-end">
        <Button variant="default" onClick={onClose}>取消</Button>
        <Button loading={mark.isPending} onClick={() => { setSubmitted(true); if (!problem) mark.mutate(note.trim()); }}>標記已付款</Button>
      </Group>
    </Stack>
  );
}
