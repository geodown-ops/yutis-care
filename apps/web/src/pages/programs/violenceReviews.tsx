/*
 * 不法侵害預防 · 措施查核及評估 (職護、職醫、職安衛人員): a draft per site, then sign-off by the people named on it.
 * Each signer gets a one-time link, emailed where the mail service sends; the links are shown once, when issued.
 */
import {
  ActionIcon, Alert, Autocomplete, Box, Button, Card, Chip, CopyButton, Group, Modal, Select, SimpleGrid, Skeleton, Stack, Table, Text, Textarea, TextInput, Tooltip,
} from '@mantine/core';
import { IconCheck, IconCopy, IconPlus, IconTrash } from '@tabler/icons-react';
import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useState } from 'react';
import { todayIso } from '../../cases';
import { when } from '../advice/InterviewFollowUp';
import { CardNote, problemText } from '../states';
import { staffQuery } from './directory';
import { OrgFilterSelects } from './listControls';
import { matchOrg, NO_ORG_FILTER, type OrgFilter } from './lists';
import { DateField, DepartmentSelect, dt, Kv, saveProblem, staffOptionRenderer, ToneBadge, useModalSize, useMySites } from './maternalViolenceCommon';
import {
  checkedItems, emptySigner, MAX_SIGNERS, REVIEW_TONE, reviewBody, reviewDraft, reviewNames, reviewProblem, signLinksText, signProgress, staffMatches, VIO_REVIEW,
  type Review, type ReviewDraft, type ReviewItemDraft, type SignerDraft, type SignLink,
} from './violence';
import { signOffRolesQuery, useDeleteReview, useResendSignLink, useSaveReview, useSubmitReview } from './violenceQueries';

const box = { background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' } as const;
const NOWRAP = { whiteSpace: 'nowrap' } as const;

type Open = { id: string } | { id: null } | null;

export function ViolenceReviewsTab({ reviews, onNotice }: { reviews: UseQueryResult<Review[]>; onNotice: (text: string) => void }) {
  const sites = useMySites();
  const [org, setOrg] = useState<OrgFilter>(NO_ORG_FILTER);
  const [open, setOpen] = useState<Open>(null);
  const [links, setLinks] = useState<SignLink[] | null>(null);
  const current = open?.id ? reviews.data?.find(r => r.id === open.id) ?? null : null;
  const rows = (reviews.data ?? []).filter(r => matchOrg(r, org));
  const size = useModalSize('xl');
  const close = () => { setOpen(null); setLinks(null); };
  const title = links ? '已送出簽核' : !open ? '' : !open.id ? '新增措施查核及評估' : current?.status === '草稿' ? '編輯措施查核及評估' : '措施查核及評估';

  return (
    <Card>
      <Group justify="space-between" gap="sm" mb="sm">
        <Group gap="sm">
          <OrgFilterSelects rows={reviews.data ?? []} names={reviewNames(reviews.data ?? [])} value={org} onChange={setOrg} />
          <Text size="sm" c="dimmed">定期查核預防措施的執行情形，送出後請相關人員以一次性連結簽核。</Text>
        </Group>
        <Button leftSection={<IconPlus size={16} />} size="sm" onClick={() => setOpen({ id: null })} disabled={!sites.length}>新增查核</Button>
      </Group>
      {reviews.isPending ? <Skeleton h={200} /> : reviews.isError ? <CardNote>{problemText(reviews.error)}</CardNote> : (
        <>
          <Table.ScrollContainer minWidth={720}>
            <Table verticalSpacing="sm" highlightOnHover>
              <Table.Thead>
                <Table.Tr><Table.Th>檢核日期</Table.Th><Table.Th>廠區</Table.Th><Table.Th>部門</Table.Th><Table.Th>已檢核項目</Table.Th><Table.Th>狀態</Table.Th><Table.Th>簽核</Table.Th><Table.Th /></Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {rows.map(r => (
                  <Table.Tr key={r.id}>
                    <Table.Td style={NOWRAP}>{dt(r.reviewedOn)}</Table.Td>
                    <Table.Td>{r.siteName}</Table.Td>
                    <Table.Td>{r.departmentName ?? <Text span size="sm" c="dimmed">全廠</Text>}</Table.Td>
                    <Table.Td>{checkedItems(r.items)}／{VIO_REVIEW.length}</Table.Td>
                    <Table.Td><ToneBadge tone={REVIEW_TONE[r.status]}>{r.status}</ToneBadge></Table.Td>
                    <Table.Td style={NOWRAP}><SignCell review={r} /></Table.Td>
                    <Table.Td ta="right">
                      <Button size="xs" variant={r.status === '草稿' ? 'filled' : 'default'} onClick={() => setOpen({ id: r.id })}>{r.status === '草稿' ? '編輯' : '檢視'}</Button>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {rows.length === 0 && <CardNote>{reviews.data.length ? '沒有符合條件的查核。' : '還沒有措施查核及評估。按「新增查核」記錄第一次查核。'}</CardNote>}
        </>
      )}
      <Modal opened={!!open} onClose={close} title={title} {...size}>
        {links ? <SubmittedLinks links={links} onClose={close} />
          : open && (!open.id || current?.status === '草稿')
            ? <ReviewForm key={open.id ?? 'new'} review={current} onCancel={close}
                onSaved={text => { close(); onNotice(text); }} onSubmitted={l => { setLinks(l); onNotice(`已送出簽核。${signLinksText(l).text}`); }} />
            : current ? <ReviewView review={current} onClose={close} />
              : open && <CardNote>找不到這份查核，可能已被刪除。</CardNote>}
      </Modal>
    </Card>
  );
}

function SignCell({ review }: { review: Review }) {
  const p = signProgress(review.signatures);
  if (!p.total) return <Text span size="sm" c="dimmed">未設定</Text>;
  if (review.status === '草稿') return <Text span size="sm">{p.total} 位簽核人員</Text>;
  return <ToneBadge tone={p.tone}>{p.signed}／{p.total} 已簽核</ToneBadge>;
}

function ReviewForm({ review, onCancel, onSaved, onSubmitted }: {
  review: Review | null; onCancel: () => void; onSaved: (text: string) => void; onSubmitted: (links: SignLink[]) => void;
}) {
  const sites = useMySites();
  const roles = useQuery(signOffRolesQuery);
  const staff = useQuery(staffQuery);
  const staffList = staff.data ?? [];
  const renderStaff = staffOptionRenderer(new Map(staffList.map(s => [s.id, s.email])));
  const [d, setD] = useState<ReviewDraft>(() => reviewDraft(review, { today: todayIso(), siteId: sites[0]?.id ?? null }));
  const [tried, setTried] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const save = useSaveReview();
  const submit = useSubmitReview();
  const remove = useDeleteReview();
  const problem = reviewProblem(d, roles.data ?? []);
  const signers = d.signers.filter(s => s.role || s.name.trim() || s.email.trim());
  const busy = save.isPending || submit.isPending || remove.isPending;
  const error = save.error ?? submit.error ?? remove.error;
  const setItem = (i: number, patch: Partial<ReviewItemDraft>) => setD(x => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const setSigner = (i: number, patch: Partial<SignerDraft>) => setD(x => ({ ...x, signers: x.signers.map((s, j) => (j === i ? { ...s, ...patch } : s)) }));

  const saveDraft = () => {
    setTried(true);
    if (problem) return;
    save.mutate({ id: review?.id ?? null, body: reviewBody(d) }, { onSuccess: () => onSaved('已儲存措施查核及評估草稿。') });
  };
  const sendForSignOff = async () => {
    setTried(true);
    if (problem || !signers.length) return;
    const saved = await save.mutateAsync({ id: review?.id ?? null, body: reviewBody(d) }).catch(() => null);
    if (!saved) return;
    const links = await submit.mutateAsync(saved.id).catch(() => null);
    if (links) onSubmitted(links);
  };

  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="sm">
        <DateField label="檢核日期" required value={d.reviewedOn} onChange={e => { const v = e.currentTarget.value; setD(x => ({ ...x, reviewedOn: v })); }} />
        <Select label="廠區" required value={d.siteId} allowDeselect={false} data={sites.map(s => ({ value: s.id, label: s.name }))}
          onChange={v => setD(x => ({ ...x, siteId: v, departmentId: null }))} />
        <DepartmentSelect siteId={d.siteId} value={d.departmentId} onChange={v => setD(x => ({ ...x, departmentId: v }))} />
      </SimpleGrid>

      <div>
        <Group justify="space-between" mb="xs">
          <Text fw={600}>查核項目</Text>
          <Text size="xs" c="dimmed">已檢核 {checkedItems(d.items)}／{VIO_REVIEW.length} 項</Text>
        </Group>
        <Stack gap="xs">
          {d.items.map((it, i) => {
            const points = VIO_REVIEW.find(v => v.item === it.item)?.points ?? [];
            return (
              <Box key={it.item} p="sm" style={box}>
                <Group justify="space-between" gap="xs" mb={6}>
                  <Text size="sm" fw={600}>{it.item}</Text>
                  {points.length > 0 && (
                    <Chip.Group multiple value={it.points} onChange={v => setItem(i, { points: v })}>
                      <Group gap={4} role="group" aria-label={`${it.item}檢點重點`}>{points.map(p => <Chip key={p} value={p} size="xs" variant="outline">{p}</Chip>)}</Group>
                    </Chip.Group>
                  )}
                </Group>
                <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="xs">
                  <Textarea size="xs" autosize minRows={2} maxLength={2000} placeholder="結果" aria-label={`${it.item}結果`} value={it.result}
                    onChange={e => setItem(i, { result: e.currentTarget.value })} />
                  <Textarea size="xs" autosize minRows={2} maxLength={2000} placeholder="修正相關控制措施／改善情形採行措施" aria-label={`${it.item}修正措施`} value={it.fix}
                    onChange={e => setItem(i, { fix: e.currentTarget.value })} />
                </SimpleGrid>
              </Box>
            );
          })}
        </Stack>
      </div>

      <div>
        <Text fw={600}>簽核人員</Text>
        <Text size="xs" c="dimmed" mb="xs">輸入姓名或 Email 可從後台人員帶入；不在清單上的人可以直接填寫。送出簽核時，每位簽核人員各有一個一次性連結（最多 {MAX_SIGNERS} 位）。</Text>
        <Stack gap="xs">
          {d.signers.map((s, i) => (
            <Group key={i} gap="xs" align="flex-start" wrap="nowrap">
              <SimpleGrid cols={{ base: 1, sm: 3 }} spacing="xs" style={{ flex: 1 }}>
                <Select size="xs" aria-label={`第 ${i + 1} 位簽核人員類別`} placeholder="人員類別" data={withRole(roles.data ?? [], s.role)} value={s.role}
                  onChange={v => setSigner(i, { role: v })} error={roles.isError ? problemText(roles.error) : undefined} />
                <Autocomplete size="xs" aria-label={`第 ${i + 1} 位簽核人員姓名`} placeholder="姓名" maxLength={100} value={s.name}
                  data={staffMatches(staffList, s.name)} filter={({ options }) => options} renderOption={renderStaff}
                  onChange={name => setSigner(i, { name })}
                  onOptionSubmit={id => { const m = staffList.find(x => x.id === id); if (m) setSigner(i, { name: m.name, email: m.email }); }} />
                <TextInput size="xs" type="email" aria-label={`第 ${i + 1} 位簽核人員 Email`} placeholder="Email" maxLength={200} value={s.email}
                  onChange={e => setSigner(i, { email: e.currentTarget.value })} />
              </SimpleGrid>
              <ActionIcon variant="subtle" color="gray" aria-label={`移除第 ${i + 1} 位簽核人員`} onClick={() => setD(x => ({ ...x, signers: x.signers.filter((_, j) => j !== i) }))}>
                <IconTrash size={16} />
              </ActionIcon>
            </Group>
          ))}
          <div>
            <Button size="xs" variant="default" leftSection={<IconPlus size={14} />} disabled={d.signers.length >= MAX_SIGNERS}
              onClick={() => setD(x => ({ ...x, signers: [...x.signers, emptySigner()] }))}>新增簽核人員</Button>
          </div>
        </Stack>
      </div>

      {deleting && review && (
        <Alert color="red" variant="light" title="刪除這份草稿？">
          <Text size="sm" mb="xs">{dt(review.reviewedOn)} {review.siteName} 的查核草稿會被刪除，無法復原。</Text>
          <Group gap="xs">
            <Button size="xs" color="red" loading={remove.isPending} onClick={() => remove.mutate(review.id, { onSuccess: () => onSaved('已刪除查核草稿。') })}>確定刪除</Button>
            <Button size="xs" variant="default" onClick={() => setDeleting(false)}>取消</Button>
          </Group>
        </Alert>
      )}
      {tried && problem && <Text size="sm" c="var(--yutis-bad)">{problem}</Text>}
      {error && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(error)}</Text>}
      <Group justify="space-between" gap="sm">
        <div>{review && !deleting && <Button variant="subtle" color="red" onClick={() => setDeleting(true)} disabled={busy}>刪除草稿</Button>}</div>
        <Group gap="sm">
          <Button variant="default" onClick={onCancel} disabled={busy}>取消</Button>
          <Button variant="default" loading={save.isPending && !submit.isPending} disabled={busy} onClick={saveDraft}>儲存草稿</Button>
          <Tooltip label="請先加入簽核人員" disabled={signers.length > 0}>
            <Button loading={submit.isPending} disabled={busy || !signers.length} onClick={() => void sendForSignOff()}>送出簽核</Button>
          </Tooltip>
        </Group>
      </Group>
    </Stack>
  );
}

/** Keep a role saved earlier selectable even if the tenant has since removed it (the API will say so on save). */
const withRole = (roles: readonly string[], current: string | null) => (current && !roles.includes(current) ? [...roles, current] : [...roles]);

function ReviewView({ review, onClose }: { review: Review; onClose: () => void }) {
  const resend = useResendSignLink(review.id);
  const [issued, setIssued] = useState<Record<string, SignLink>>({});
  return (
    <Stack gap="md">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <Kv label="檢核日期" value={dt(review.reviewedOn)} />
        <Kv label="廠區" value={review.siteName} />
        <Kv label="部門" value={review.departmentName ?? '全廠'} />
        <Kv label="狀態" value={<ToneBadge tone={REVIEW_TONE[review.status]}>{review.status}</ToneBadge>} />
      </SimpleGrid>
      <Table.ScrollContainer minWidth={640}>
        <Table verticalSpacing={6}>
          <Table.Thead><Table.Tr><Table.Th>項目</Table.Th><Table.Th>檢點重點</Table.Th><Table.Th>結果</Table.Th><Table.Th>修正相關控制措施／改善情形</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {review.items.map(i => (
              <Table.Tr key={i.item}>
                <Table.Td style={NOWRAP}>{i.item}</Table.Td>
                <Table.Td>{i.points.join('、') || '—'}</Table.Td>
                <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{i.result || '—'}</Table.Td>
                <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{i.fix || '—'}</Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      <div>
        <Text fw={600} mb="xs">簽核紀錄</Text>
        <Table.ScrollContainer minWidth={720}>
          <Table verticalSpacing={6}>
            <Table.Thead>
              <Table.Tr style={NOWRAP}><Table.Th>人員類別</Table.Th><Table.Th>姓名</Table.Th><Table.Th>首次發出連結</Table.Th><Table.Th>最近發出連結</Table.Th><Table.Th>簽核</Table.Th><Table.Th>回覆意見</Table.Th><Table.Th /></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {review.signatures.map(s => (
                <Table.Tr key={s.id}>
                  <Table.Td style={NOWRAP}>{s.role}</Table.Td>
                  <Table.Td>{s.name}<Text size="xs" c="dimmed">{s.email}</Text></Table.Td>
                  <Table.Td>{when(s.firstSentAt)}</Table.Td>
                  <Table.Td>{when(s.sentAt)}</Table.Td>
                  <Table.Td style={NOWRAP}>{s.signedAt ? <ToneBadge tone="ok">{when(s.signedAt)}</ToneBadge> : <Text span size="sm" c="dimmed">未簽核</Text>}</Table.Td>
                  <Table.Td style={{ whiteSpace: 'pre-wrap' }}>{s.comment || '—'}</Table.Td>
                  <Table.Td ta="right">
                    {review.status === '簽核中' && !s.signedAt && (
                      <Button size="compact-xs" variant="default" loading={resend.isPending && resend.variables === s.id}
                        onClick={() => resend.mutate(s.id, { onSuccess: l => setIssued(x => ({ ...x, [s.id]: l })) })}>重發連結</Button>
                    )}
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
        {resend.isError && <Text size="sm" c="var(--yutis-bad)" role="alert" mt="xs">{saveProblem(resend.error)}</Text>}
        {Object.keys(issued).length > 0 && (
          <Stack gap="xs" mt="sm">
            <SentNote links={Object.values(issued)} />
            {review.signatures.filter(s => issued[s.id]).map(s => <LinkRow key={s.id} label={`${s.role} ${s.name}`} url={issued[s.id]!.url} />)}
            <Text size="xs" c="dimmed">舊連結已失效。新連結只顯示這一次。</Text>
          </Stack>
        )}
      </div>
      <Group justify="flex-end"><Button variant="default" onClick={onClose}>關閉</Button></Group>
    </Stack>
  );
}

/** Whether the sign-off emails really went out (SignLinkDto.emailed); when not, the links must be handed over. */
function SentNote({ links }: { links: readonly SignLink[] }) {
  const s = signLinksText(links);
  return <Text size="sm" fw={s.copy ? 600 : undefined} c={s.copy ? 'var(--yutis-warn)' : undefined}>{s.text}</Text>;
}

function SubmittedLinks({ links, onClose }: { links: SignLink[]; onClose: () => void }) {
  const unsent = links.some(l => !l.emailed);
  return (
    <Stack gap="md">
      <SentNote links={links} />
      <Stack gap="xs">{links.map(l => <LinkRow key={l.signatureId} label={`${l.role} ${l.name}${l.emailed ? '' : '（未寄信）'}`} url={l.url} />)}</Stack>
      <Text size="xs" c="dimmed">連結只顯示這一次，14 天內有效。{unsent ? '' : '簽核人員沒收到信時，也可以複製連結另行提供。'}</Text>
      <Group justify="flex-end"><Button onClick={onClose}>完成</Button></Group>
    </Stack>
  );
}

function LinkRow({ label, url }: { label: string; url: string }) {
  return (
    <div>
      <Text size="xs" c="dimmed" mb={2}>{label}</Text>
      <Group gap={4} wrap="nowrap">
        <TextInput size="xs" readOnly value={url} aria-label={`${label} 的簽核連結`} style={{ flex: 1, minWidth: 0 }} onFocus={e => e.currentTarget.select()} />
        <CopyButton value={url}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? '已複製' : '複製連結'}>
              <ActionIcon variant="default" onClick={copy} aria-label={`複製 ${label} 的簽核連結`}>{copied ? <IconCheck size={14} /> : <IconCopy size={14} />}</ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </div>
  );
}
