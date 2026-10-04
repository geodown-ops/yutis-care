import { Autocomplete, Box, Button, Card, Grid, Group, NavLink, SegmentedControl, Skeleton, Stack, Table, Text, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState, type FormEvent } from 'react';
import { api } from '../../api';
import { CardNote, problemText } from '../states';
import { KIND_LABEL, phraseCategories, pickCategory, type Phrase, type PhraseKind } from './phrases';
import { phrasesQuery } from './queries';
import { ConfirmModal, ErrorNote, ToneBadge } from './ui';

/** 片語庫: what care staff see in the 片語 panel while writing records and measures, by category. */
export function PhrasesPanel() {
  const qc = useQueryClient();
  const list = useQuery(phrasesQuery);
  const [wanted, setWanted] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Phrase | null>(null);
  const del = useMutation({
    mutationFn: (id: string) => data(api.DELETE('/api/admin/phrases/{id}', { params: { path: { id } } })),
    onSuccess: async () => { await qc.invalidateQueries({ queryKey: phrasesQuery.queryKey }); closeDelete(); },
  });
  const closeDelete = () => { del.reset(); setDeleting(null); };

  if (list.isPending) return <Card><Skeleton h={320} /></Card>;
  if (list.isError) return <Card><CardNote>{problemText(list.error)}</CardNote></Card>;

  const categories = phraseCategories(list.data);
  const current = pickCategory(categories, wanted);
  const shown = list.data.filter(p => p.category === current);

  return (
    <Stack gap="md">
      <Grid gap="md">
        <Grid.Col span={{ base: 12, md: 4 }}>
          <Card>
            <Text fw={600} size="lg" mb="xs">分類</Text>
            {categories.length === 0 ? <CardNote>還沒有片語。</CardNote> : (
              <Stack gap={2}>
                {categories.map(c => (
                  <NavLink key={c.category} label={c.category} active={c.category === current} onClick={() => setWanted(c.category)}
                    rightSection={<Text size="xs" c="dimmed" ff="monospace">{c.count}</Text>} styles={{ root: { borderRadius: 999 } }} />
                ))}
              </Stack>
            )}
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, md: 8 }}>
          <Stack gap="md">
            {current && (
              <Card>
                <Text fw={600} size="lg" mb="sm">{current}</Text>
                <Table.ScrollContainer minWidth={480}>
                  <Table verticalSpacing="sm" highlightOnHover>
                    <Table.Thead><Table.Tr><Table.Th>片語內容</Table.Th><Table.Th w={130}>類型</Table.Th><Table.Th w={80} /></Table.Tr></Table.Thead>
                    <Table.Tbody>
                      {shown.map(p => (
                        <Table.Tr key={p.id}>
                          <Table.Td fz="sm" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</Table.Td>
                          <Table.Td>{p.kind ? <ToneBadge tone={p.kind === '改善' ? 'warn' : 'info'}>{KIND_LABEL[p.kind]}</ToneBadge> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
                          <Table.Td><Button size="compact-sm" variant="subtle" color="gray" onClick={() => setDeleting(p)} aria-label={`刪除片語 ${p.text}`}>刪除</Button></Table.Td>
                        </Table.Tr>
                      ))}
                    </Table.Tbody>
                  </Table>
                </Table.ScrollContainer>
              </Card>
            )}
            <AddPhrase current={current ?? ''} categories={categories.map(c => c.category)} onAdded={setWanted} />
          </Stack>
        </Grid.Col>
      </Grid>
      <ConfirmModal opened={!!deleting} title="刪除片語" confirmLabel="刪除" danger busy={del.isPending} error={del.error}
        onConfirm={() => deleting && del.mutate(deleting.id)} onClose={closeDelete}>
        確定要刪除「{deleting?.text}」嗎？已寫入紀錄的文字不受影響。
      </ConfirmModal>
    </Stack>
  );
}

/** Follows the category on screen until the admin types another; a new category name starts a new group. */
function AddPhrase({ current, categories, onAdded }: { current: string; categories: string[]; onAdded: (category: string) => void }) {
  const qc = useQueryClient();
  const [typed, setTyped] = useState<string | null>(null);
  const category = typed ?? current;
  const [text, setText] = useState('');
  const [kind, setKind] = useState<PhraseKind | 'none'>('none');
  const create = useMutation({
    mutationFn: () => data(api.POST('/api/admin/phrases', { body: { category: category.trim(), text: text.trim(), kind: kind === 'none' ? null : kind } })),
    onSuccess: async p => { await qc.invalidateQueries({ queryKey: phrasesQuery.queryKey }); setText(''); setTyped(null); onAdded(p.category); },
  });
  const ready = category.trim() !== '' && text.trim() !== '';
  const submit = (e: FormEvent) => { e.preventDefault(); if (ready) create.mutate(); };

  return (
    <Card>
      <Text fw={600} size="lg" mb="sm">新增片語</Text>
      <form onSubmit={submit}>
        <Stack gap="sm">
          <Autocomplete label="分類" required value={category} onChange={setTyped} data={categories} maxLength={50}
            placeholder="例如 不法侵害－措施" description="選擇現有分類，或輸入新的分類名稱" />
          <Textarea label="片語內容" required value={text} onChange={e => setText(e.currentTarget.value)} maxLength={500} autosize minRows={2} />
          <Box>
            <Text size="sm" fw={500} mb={4}>措施類型</Text>
            <SegmentedControl size="xs" value={kind} onChange={v => setKind(v as PhraseKind | 'none')}
              data={[{ value: 'none', label: '一般片語' }, { value: '改善', label: KIND_LABEL['改善'] }, { value: '建議', label: KIND_LABEL['建議'] }]} />
            <Text size="xs" c="dimmed" mt={4}>措施類片語（例如不法侵害預防措施）才需要選擇類型。</Text>
          </Box>
          <ErrorNote error={create.error} />
          <Group justify="flex-end"><Button type="submit" loading={create.isPending} disabled={!ready}>新增片語</Button></Group>
        </Stack>
      </form>
    </Card>
  );
}
