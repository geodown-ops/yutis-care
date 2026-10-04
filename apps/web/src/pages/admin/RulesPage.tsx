import { Alert, Box, Button, Card, Group, Modal, SegmentedControl, Skeleton, Stack, Table, Tabs, Text, Textarea, TextInput } from '@mantine/core';
import { useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { data, type Schemas } from '@yutis/api-client';
import type { Grade } from '@yutis/domain';
import { GradeBadge } from '@yutis/ui';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { CardNote, problemText } from '../states';
import { ruleSetQuery, ruleSetsQuery } from './queries';
import {
  changedRules, defaultVersion, fromDrafts, isText, levelProblems, levelText, readRules, ruleKey, SRC_LABEL, STATUS_LABEL, toDrafts,
  type LevelDraft, type Rule, type RuleSetStatus,
} from './rules';
import { AdminTitle, ConfirmModal, ErrorNote, FormActions, InfoNote, ToneBadge, type Tone } from './ui';

type RuleSet = Schemas['RuleSetDto'];
export type RulesTab = 'grading' | 'phrases';

const STATUS_TONE: Record<RuleSetStatus, Tone> = { published: 'ok', draft: 'warn', retired: 'muted' };
const dt = (d: string | null) => (d ? d.replaceAll('-', '/') : '—');

/** 分級標準、片語、簽核角色. Sign-off roles have no tenant API yet, so only the first two are here. */
export function RulesPage({ tab, onTab }: { tab: RulesTab; onTab: (t: RulesTab) => void }) {
  return (
    <Stack gap="lg">
      <AdminTitle title="分級標準與片語" description="健檢分級標準依版本管理；片語是撰寫協助紀錄與措施時插入的常用文字。簽核角色由 Yutis 平台設定，目前無法在這裡查看或修改。" />
      <Tabs value={tab} onChange={v => onTab((v as RulesTab) ?? 'grading')} keepMounted={false}>
        <Tabs.List mb="md">
          <Tabs.Tab value="grading">分級標準</Tabs.Tab>
          <Tabs.Tab value="phrases">片語庫</Tabs.Tab>
        </Tabs.List>
        <Tabs.Panel value="grading"><GradingStandards /></Tabs.Panel>
        <Tabs.Panel value="phrases"><Phrases /></Tabs.Panel>
      </Tabs>
    </Stack>
  );
}

interface Draft { base: RuleSet; rules: Rule[]; baseRules: Rule[]; note: string }

function GradingStandards() {
  const { data: sets } = useSuspenseQuery(ruleSetsQuery);
  const [selectedId, setSelectedId] = useState<string | null>(() => defaultVersion(sets)?.id ?? null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [publishing, setPublishing] = useState<RuleSet | null>(null);
  const selected = sets.find(s => s.id === selectedId) ?? defaultVersion(sets);
  const detail = useQuery({ ...ruleSetQuery(selected?.id ?? ''), enabled: !!selected });
  const nextVersion = Math.max(0, ...sets.map(s => s.version)) + 1;

  if (!selected) return <Card><CardNote>還沒有任何分級標準。請聯絡 Yutis 套用預設範本。</CardNote></Card>;

  return (
    <Stack gap="md">
      <Card>
        <Text fw={600} size="lg" mb="xs">版本</Text>
        <Text size="sm" c="dimmed" mb="sm">版本儲存後不能修改。要調整切點，請以某一版建立新版草稿，確認後發布；之後匯入的健檢依新版分級，已匯入的結果保留原本的版本。</Text>
        <Table.ScrollContainer minWidth={560}>
          <Table verticalSpacing="sm" highlightOnHover>
            <Table.Thead><Table.Tr><Table.Th w={80}>版本</Table.Th><Table.Th w={100}>狀態</Table.Th><Table.Th w={120}>生效日</Table.Th><Table.Th>備註</Table.Th><Table.Th w={190} /></Table.Tr></Table.Thead>
            <Table.Tbody>
              {sets.map(s => (
                <Table.Tr key={s.id} bg={s.id === selected.id ? 'var(--yutis-surface2)' : undefined}>
                  <Table.Td fw={600}>v{s.version}</Table.Td>
                  <Table.Td><ToneBadge tone={STATUS_TONE[s.status]}>{STATUS_LABEL[s.status]}</ToneBadge></Table.Td>
                  <Table.Td>{dt(s.effectiveFrom)}</Table.Td>
                  <Table.Td fz="sm" c={s.note ? undefined : 'dimmed'}>{s.note || '—'}</Table.Td>
                  <Table.Td>
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                      {s.id === selected.id ? <Text size="sm" c="dimmed">顯示中</Text>
                        : <Button size="compact-sm" variant="default" onClick={() => setSelectedId(s.id)} disabled={!!draft}>查看</Button>}
                      {s.status === 'draft' && <Button size="compact-sm" onClick={() => setPublishing(s)} disabled={!!draft}>發布</Button>}
                    </Group>
                  </Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      </Card>

      {detail.isPending ? <Card><Skeleton h={360} /></Card> : detail.isError ? <Card><CardNote>{problemText(detail.error)}</CardNote></Card> : draft ? (
        <DraftEditor draft={draft} nextVersion={nextVersion} onChange={setDraft} onCancel={() => setDraft(null)}
          onSaved={id => { setDraft(null); setSelectedId(id); }} />
      ) : (
        <Card>
          <Group justify="space-between" mb="sm" gap="sm">
            <Group gap="xs"><Text fw={600} size="lg">v{selected.version} 的分級規則</Text><ToneBadge tone={STATUS_TONE[selected.status]}>{STATUS_LABEL[selected.status]}</ToneBadge></Group>
            <Button variant="default" onClick={() => { const rules = readRules(detail.data.rules); setDraft({ base: selected, rules, baseRules: rules, note: '' }); }}>
              以 v{selected.version} 建立新版
            </Button>
          </Group>
          <RulesTable rules={readRules(detail.data.rules)} />
        </Card>
      )}
      <PublishModal set={publishing} current={sets.find(s => s.status === 'published')} onClose={() => setPublishing(null)} onPublished={id => setSelectedId(id)} />
    </Stack>
  );
}

function RulesTable({ rules, changed, onEdit }: { rules: Rule[]; changed?: Set<string>; onEdit?: (r: Rule) => void }) {
  return (
    <Table.ScrollContainer minWidth={900}>
      <Table verticalSpacing="sm" highlightOnHover>
        <Table.Thead>
          <Table.Tr><Table.Th w={80}>代碼</Table.Th><Table.Th>檢項</Table.Th><Table.Th w={60}>性別</Table.Th><Table.Th w={70}>單位</Table.Th><Table.Th>級距</Table.Th><Table.Th w={90}>來源</Table.Th>{onEdit && <Table.Th w={140} />}</Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rules.map(r => {
            const isChanged = changed?.has(ruleKey(r));
            return (
              <Table.Tr key={ruleKey(r)} bg={isChanged ? 'var(--yutis-warn-weak)' : undefined}>
                <Table.Td ff="monospace" fz="sm">{r.code}</Table.Td>
                <Table.Td fw={600}>{r.name}{isText(r) && <Text span size="xs" c="dimmed" ml={6}>文字</Text>}</Table.Td>
                <Table.Td>{r.sex}</Table.Td>
                <Table.Td fz="sm">{r.unit || '—'}</Table.Td>
                <Table.Td>
                  <Group gap={6}>
                    {r.levels.map(l => (
                      <Group key={l.lv} gap={4} wrap="nowrap" px={6} py={2} style={{ background: 'var(--yutis-surface2)', borderRadius: 999 }}>
                        <GradeBadge grade={l.lv as Grade} /><Text size="xs">{levelText(l)}</Text>
                      </Group>
                    ))}
                  </Group>
                </Table.Td>
                <Table.Td><ToneBadge tone={r.src === 'demo' ? 'muted' : 'info'}>{SRC_LABEL[r.src ?? 'manual']}</ToneBadge></Table.Td>
                {onEdit && (
                  <Table.Td>
                    <Group gap={6} justify="flex-end" wrap="nowrap">
                      {isChanged && <Text size="xs" c="var(--yutis-warn)" fw={600}>已修改</Text>}
                      <Button size="compact-sm" variant="default" onClick={() => onEdit(r)} aria-label={`編輯 ${r.name}`}>編輯</Button>
                    </Group>
                  </Table.Td>
                )}
              </Table.Tr>
            );
          })}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

function DraftEditor({ draft, nextVersion, onChange, onCancel, onSaved }: {
  draft: Draft; nextVersion: number; onChange: (d: Draft) => void; onCancel: () => void; onSaved: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Rule | null>(null);
  const changed = changedRules(draft.baseRules, draft.rules);
  const save = useMutation({
    mutationFn: () => data(api.POST('/api/admin/rule-sets', { body: { rules: draft.rules, ...(draft.note.trim() && { note: draft.note.trim() }) } })),
    onSuccess: async created => { await qc.invalidateQueries({ queryKey: ['admin', 'rule-sets'] }); onSaved(created.id); },
  });

  return (
    <Card style={{ outline: '2px solid var(--yutis-brand)' }}>
      <Stack gap="sm" mb="md">
        <Group justify="space-between" gap="sm">
          <Text fw={600} size="lg">新版草稿 v{nextVersion}（以 v{draft.base.version} 為基礎）</Text>
          <Text size="sm" c={changed.size ? 'var(--yutis-warn)' : 'dimmed'} fw={changed.size ? 600 : undefined}>
            {changed.size ? `已修改 ${changed.size} 項` : `與 v${draft.base.version} 相同`}
          </Text>
        </Group>
        <Text size="sm" c="dimmed">按「編輯」調整各檢項的級距。儲存後成為草稿，不影響目前的分級，發布後才生效。</Text>
        <Group align="flex-end" gap="sm">
          <TextInput label="版本備註" placeholder="例如 依職醫建議調整舒張壓切點" value={draft.note} onChange={e => onChange({ ...draft, note: e.currentTarget.value })} maxLength={200} style={{ flex: '1 1 280px' }} />
          <Button variant="default" onClick={onCancel}>取消</Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>儲存為草稿 v{nextVersion}</Button>
        </Group>
        <ErrorNote error={save.error} />
      </Stack>
      <RulesTable rules={draft.rules} changed={changed} onEdit={setEditing} />
      <Modal opened={!!editing} onClose={() => setEditing(null)} title={editing ? `編輯分級規則 · ${editing.name}` : ''} size="lg">
        {editing && (
          <RuleForm key={ruleKey(editing)} rule={editing} original={draft.baseRules.find(r => ruleKey(r) === ruleKey(editing))!}
            onCancel={() => setEditing(null)}
            onApply={next => { onChange({ ...draft, rules: draft.rules.map(r => (ruleKey(r) === ruleKey(next) ? next : r)) }); setEditing(null); }} />
        )}
      </Modal>
    </Card>
  );
}

function RuleForm({ rule, original, onApply, onCancel }: { rule: Rule; original: Rule; onApply: (r: Rule) => void; onCancel: () => void }) {
  const [levels, setLevels] = useState<LevelDraft[]>(() => toDrafts(rule));
  const problems = levelProblems(rule, levels);
  const text = isText(rule);
  const set = (i: number, k: keyof LevelDraft, v: string) => setLevels(levels.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const submit = (e: FormEvent) => { e.preventDefault(); if (!problems.length) onApply(fromDrafts(rule, levels)); };

  return (
    <form onSubmit={submit} noValidate>
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {rule.code} · {rule.sex}{rule.unit ? ` · 單位 ${rule.unit}` : ''}。{text ? '每一級填入對應的檢查結果，多個以「、」分隔。' : '下限含（≥），上限不含（<），留空表示不設限。'}
        </Text>
        <Table verticalSpacing={6}>
          <Table.Thead><Table.Tr><Table.Th w={70}>級數</Table.Th>{text ? <Table.Th>結果值</Table.Th> : <><Table.Th>下限（≥）</Table.Th><Table.Th>上限（&lt;）</Table.Th></>}</Table.Tr></Table.Thead>
          <Table.Tbody>
            {levels.map((l, i) => (
              <Table.Tr key={l.lv}>
                <Table.Td><GradeBadge grade={l.lv as Grade} /></Table.Td>
                {text ? (
                  <Table.Td><TextInput aria-label={`第 ${l.lv} 級結果值`} value={l.values} onChange={e => set(i, 'values', e.currentTarget.value)} /></Table.Td>
                ) : (
                  <>
                    <Table.Td><TextInput aria-label={`第 ${l.lv} 級下限`} inputMode="decimal" value={l.min} onChange={e => set(i, 'min', e.currentTarget.value)} /></Table.Td>
                    <Table.Td><TextInput aria-label={`第 ${l.lv} 級上限`} inputMode="decimal" value={l.max} onChange={e => set(i, 'max', e.currentTarget.value)} /></Table.Td>
                  </>
                )}
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
        {problems.length > 0 && <Alert color="red" variant="light" p="xs"><Stack gap={2}>{problems.map(p => <Text key={p} size="sm">{p}</Text>)}</Stack></Alert>}
        <Group justify="space-between" mt="xs">
          <Button variant="subtle" color="gray" onClick={() => setLevels(toDrafts(original))}>還原為原版本</Button>
          <FormActions onCancel={onCancel} submitLabel="套用" disabled={problems.length > 0} />
        </Group>
      </Stack>
    </form>
  );
}

function PublishModal({ set, current, onClose, onPublished }: { set: RuleSet | null; current?: RuleSet; onClose: () => void; onPublished: (id: string) => void }) {
  const qc = useQueryClient();
  const publish = useMutation({
    mutationFn: (id: string) => data(api.POST('/api/admin/rule-sets/{id}/publish', { params: { path: { id } } })),
    onSuccess: async r => { await qc.invalidateQueries({ queryKey: ['admin', 'rule-sets'] }); onPublished(r.id); close(); },
  });
  const close = () => { publish.reset(); onClose(); };
  return (
    <ConfirmModal opened={!!set} title={`發布 v${set?.version ?? ''}`} confirmLabel="發布" busy={publish.isPending} error={publish.error}
      onConfirm={() => set && publish.mutate(set.id)} onClose={close}>
      發布後，之後匯入的健檢依 v{set?.version} 分級並產生異常事件；已匯入的結果保留原本的版本。{current ? `目前使用中的 v${current.version} 會停用。` : ''}
    </ConfirmModal>
  );
}

type Phrase = Schemas['PhraseDto'];
type Kind = '改善' | '建議';
const KIND_LABEL: Record<Kind, string> = { 改善: '應增加或改善', 建議: '建議可採行' };

/**
 * GET /api/phrases is for care staff only, so a tenant admin cannot list the library yet. They can add phrases, and
 * delete the ones added on this screen (the API returns their ids).
 */
function Phrases() {
  const [added, setAdded] = useState<Phrase[]>([]);
  const [category, setCategory] = useState('');
  const [text, setText] = useState('');
  const [kind, setKind] = useState<Kind | 'none'>('none');
  const [deleting, setDeleting] = useState<Phrase | null>(null);
  const create = useMutation({
    mutationFn: () => data(api.POST('/api/admin/phrases', { body: { category: category.trim(), text: text.trim(), kind: kind === 'none' ? null : kind } })),
    onSuccess: p => { setAdded([p, ...added]); setText(''); },
  });
  const del = useMutation({
    mutationFn: (id: string) => data(api.DELETE('/api/admin/phrases/{id}', { params: { path: { id } } })),
    onSuccess: (_, id) => { setAdded(added.filter(p => p.id !== id)); closeDelete(); },
  });
  const closeDelete = () => { del.reset(); setDeleting(null); };
  const ready = category.trim() !== '' && text.trim() !== '';
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) create.mutate(); };

  return (
    <Stack gap="md" maw={960}>
      <InfoNote>
        目前無法顯示片語清單：讀取片語的權限只開放給職護、職醫，租戶管理員還看不到現有的片語。這裡可以新增片語，並刪除這次新增的片語。
      </InfoNote>
      <Card>
        <Text fw={600} size="lg" mb="sm">新增片語</Text>
        <form onSubmit={submit}>
          <Stack gap="sm">
            <TextInput label="分類" required value={category} onChange={e => setCategory(e.currentTarget.value)} maxLength={50}
              placeholder="例如 不法侵害－措施" description="與職護撰寫紀錄時看到的分類名稱相同才會出現在同一組" />
            <Textarea label="片語內容" required value={text} onChange={e => setText(e.currentTarget.value)} maxLength={500} autosize minRows={2} />
            <Box>
              <Text size="sm" fw={500} mb={4}>措施類型</Text>
              <SegmentedControl size="xs" value={kind} onChange={v => setKind(v as Kind | 'none')}
                data={[{ value: 'none', label: '一般片語' }, { value: '改善', label: KIND_LABEL['改善'] }, { value: '建議', label: KIND_LABEL['建議'] }]} />
            </Box>
            <ErrorNote error={create.error} />
            <Group justify="flex-end"><Button type="submit" loading={create.isPending} disabled={!ready}>新增片語</Button></Group>
          </Stack>
        </form>
      </Card>
      {added.length > 0 && (
        <Card>
          <Text fw={600} size="lg" mb="sm">這次新增的片語</Text>
          <Table.ScrollContainer minWidth={560}>
            <Table verticalSpacing="sm">
              <Table.Thead><Table.Tr><Table.Th w={160}>分類</Table.Th><Table.Th>片語內容</Table.Th><Table.Th w={130}>類型</Table.Th><Table.Th w={80} /></Table.Tr></Table.Thead>
              <Table.Tbody>
                {added.map(p => (
                  <Table.Tr key={p.id}>
                    <Table.Td fz="sm">{p.category}</Table.Td>
                    <Table.Td fz="sm" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</Table.Td>
                    <Table.Td fz="sm">{p.kind ? KIND_LABEL[p.kind] : '—'}</Table.Td>
                    <Table.Td><Button size="compact-sm" variant="subtle" color="gray" onClick={() => setDeleting(p)} aria-label={`刪除片語 ${p.text}`}>刪除</Button></Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          <Text size="xs" c="dimmed" mt="xs">離開這個頁面後，這份清單不會保留；片語本身已存入片語庫。</Text>
        </Card>
      )}
      <ConfirmModal opened={!!deleting} title="刪除片語" confirmLabel="刪除" danger busy={del.isPending} error={del.error}
        onConfirm={() => deleting && del.mutate(deleting.id)} onClose={closeDelete}>
        確定要刪除這則片語嗎？已寫入紀錄的文字不受影響。
      </ConfirmModal>
    </Stack>
  );
}
