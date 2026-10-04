import { Alert, Badge, Button, Card, Collapse, FileInput, Group, Select, SimpleGrid, Skeleton, Stack, Table, Text, Title } from '@mantine/core';
import { IconArrowUpRight, IconDownload, IconFileSpreadsheet } from '@tabler/icons-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiRequestError } from '@yutis/api-client';
import { GradeBadge, StatCard } from '@yutis/ui';
import { useState } from 'react';
import { AnchorLink, ButtonLink } from '../../links';
import { useMe } from '../../session';
import { CardNote, problemText } from '../states';
import { nurseAccess } from './access';
import { asGrade, canCommit, fileProblem, mappingColumns, sortIssues, type ExamMapping, type ImportReport, type ImportRow } from './exams';
import { actionErrorText, downloadExamTemplate, examBatchesQuery, examMappingsQuery, useExamImport } from './queries';

const slash = (d: string) => d.replaceAll('-', '/');
const dateTime = (iso: string) => new Date(iso).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * 健檢匯入: pick the clinic (its column mapping) and the .xlsx, preview how the rows match and grade, then import.
 * The API refuses the whole file if any row has a problem, so commit is only offered for a clean preview.
 */
export function ExamImportPage() {
  const me = useMe();
  if (!nurseAccess(me).exams) {
    return (
      <Stack gap="lg" maw={640}>
        <Title order={2}>健檢匯入</Title>
        <Card><Text>只有職護、職醫可以匯入健檢結果。</Text></Card>
      </Stack>
    );
  }
  return <ExamImport />;
}

function ExamImport() {
  const mappings = useQuery(examMappingsQuery);
  const [mappingId, setMappingId] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportReport | null>(null);
  const [done, setDone] = useState<ImportReport | null>(null);
  const run = useExamImport();
  const mapping = mappings.data?.find(m => m.id === mappingId) ?? (mappings.data?.length === 1 ? mappings.data[0] : undefined);
  const problem = file ? fileProblem(file) : null;
  const reset = () => { setPreview(null); run.reset(); };

  if (done) {
    return (
      <Stack gap="lg">
        <Title order={2}>健檢匯入</Title>
        <Card>
          <Stack gap="md" align="flex-start">
            <Text fw={600} size="lg">已匯入 {done.exams} 筆健檢</Text>
            <Text c="dimmed">{mapping?.clinic} · 依分級標準第 {done.ruleSetVersion} 版分級 · 最高 3 級以上 {done.grade3Plus} 人 · 新增 {done.newEvents} 件異常事件</Text>
            <Group gap="sm">
              {done.newEvents > 0 && <ButtonLink to="/cases" rightSection={<IconArrowUpRight size={16} />}>到個案管理開單</ButtonLink>}
              <ButtonLink to="/" variant="default">回職護首頁</ButtonLink>
              <Button variant="default" onClick={() => { setDone(null); setFile(null); reset(); }}>匯入另一份</Button>
            </Group>
          </Stack>
        </Card>
        <ImportHistory />
      </Stack>
    );
  }

  return (
    <Stack gap="lg">
      <Title order={2}>健檢匯入</Title>

      <Card>
        <Text fw={600} size="lg" mb="md">1. 選擇醫院與檔案</Text>
        {mappings.isPending ? <Skeleton h={80} /> : mappings.isError ? <CardNote>{problemText(mappings.error)}</CardNote>
          : mappings.data.length === 0 ? <CardNote>還沒有健檢匯入對照。請租戶管理員到「健檢匯入對照」設定醫院的 Excel 欄位後再匯入。</CardNote> : (
            <Stack gap="md">
              <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
                <Select label="健檢醫院" placeholder="選擇醫院" data={mappings.data.map(m => ({ value: m.id, label: m.clinic }))}
                  value={mapping?.id ?? null} onChange={v => { setMappingId(v); reset(); }} allowDeselect={false} />
                <FileInput label="健檢結果檔（.xlsx）" placeholder="選擇檔案" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  leftSection={<IconFileSpreadsheet size={16} />} clearable value={file} onChange={f => { setFile(f); reset(); }} error={problem} />
              </SimpleGrid>
              {mapping && <MappingHint mapping={mapping} />}
              <Group>
                <Button disabled={!mapping || !file || !!problem} loading={run.isPending && !run.variables?.commit}
                  onClick={() => mapping && file && run.mutate({ mapping: mapping.id, file, commit: false }, { onSuccess: setPreview })}>預覽</Button>
              </Group>
              {run.isError && <Alert color="red" variant="light">{actionErrorText(run.error)}</Alert>}
            </Stack>
          )}
      </Card>

      {preview && mapping && file && (
        <Card>
          <Group justify="space-between" mb="md" gap="xs">
            <Text fw={600} size="lg">2. 預覽結果</Text>
            <Text size="sm" c="dimmed">{file.name} · 依分級標準第 {preview.ruleSetVersion} 版</Text>
          </Group>
          <SimpleGrid cols={{ base: 2, md: 4 }} spacing="sm" mb="md">
            <StatCard tone="blue" label="資料列" value={preview.rows} />
            <StatCard tone="mint" label="可匯入健檢" value={preview.exams} />
            <StatCard tone="lavender" label="3 級以上人數" value={preview.grade3Plus} note="依每人最高分級" />
            <StatCard tone="pink" label="新異常事件" value={preview.newEvents} note="匯入後會出現在個案管理" />
          </SimpleGrid>
          {preview.issues.length > 0 ? (
            <>
              <Alert color="red" variant="light" mb="sm" title={`有 ${preview.issues.length} 個問題，整份檔案不會匯入`}>
                請修正 Excel 後重新選擇檔案預覽。
              </Alert>
              <Table.ScrollContainer minWidth={480}>
                <Table verticalSpacing={6}>
                  <Table.Thead><Table.Tr><Table.Th w={80}>列</Table.Th><Table.Th w={160}>欄位</Table.Th><Table.Th>問題</Table.Th></Table.Tr></Table.Thead>
                  <Table.Tbody>
                    {sortIssues(preview.issues).map((i, n) => (
                      <Table.Tr key={n}><Table.Td>{i.row}</Table.Td><Table.Td>{i.column ?? '—'}</Table.Td><Table.Td>{i.message}</Table.Td></Table.Tr>
                    ))}
                  </Table.Tbody>
                </Table>
              </Table.ScrollContainer>
            </>
          ) : preview.exams === 0 ? <CardNote>檔案裡沒有可匯入的資料列。</CardNote> : (
            <>
              <Text size="sm" c="dimmed" mb="sm">每一列都能對應到負責廠區的員工。匯入後會寫入健檢歷史，並依每人最新一次健檢產生異常事件。</Text>
              <PreviewRows rows={preview.preview} />
            </>
          )}
          <Group justify="flex-end" mt="md">
            <Button disabled={!canCommit(preview)} loading={run.isPending && run.variables?.commit}
              onClick={() => run.mutate({ mapping: mapping.id, file, commit: true }, { onSuccess: r => (r.committed ? setDone(r) : setPreview(r)) })}>
              確認匯入 {preview.exams} 筆
            </Button>
          </Group>
        </Card>
      )}

      <ImportHistory />
    </Stack>
  );
}

/** Each row that would be imported: who, which exam, how it grades and whether it raises abnormal events. */
function PreviewRows({ rows }: { rows: ImportRow[] }) {
  return (
    <Table.ScrollContainer minWidth={720} maxHeight={440}>
      <Table verticalSpacing={6} stickyHeader highlightOnHover>
        <Table.Thead>
          <Table.Tr>
            <Table.Th w={56}>列</Table.Th><Table.Th>員工</Table.Th><Table.Th>檢查日期</Table.Th><Table.Th>類別</Table.Th>
            <Table.Th>最高分級</Table.Th><Table.Th ta="right">總分</Table.Th><Table.Th>特殊健檢</Table.Th><Table.Th>異常事件</Table.Th>
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {rows.map(r => (
            <Table.Tr key={r.row}>
              <Table.Td c="dimmed">{r.row}</Table.Td>
              <Table.Td>
                <AnchorLink to="/employees/$employeeId" params={{ employeeId: r.employeeId }} size="sm" fw={600}>{r.name}</AnchorLink>
                <Text span size="xs" c="dimmed" ff="monospace" ml={6}>{r.empNo}</Text>
              </Table.Td>
              <Table.Td>{slash(r.examDate)}</Table.Td>
              <Table.Td>{r.kind}</Table.Td>
              <Table.Td><GradeBadge grade={asGrade(r.gradeMax)} /></Table.Td>
              <Table.Td ta="right" style={{ fontVariantNumeric: 'tabular-nums' }}>{r.gradeTotal}</Table.Td>
              <Table.Td>{r.specialLevel ? `第 ${r.specialLevel} 級管理` : '—'}</Table.Td>
              <Table.Td>{r.events ? <Text size="sm" fw={600} c="var(--yutis-bad)">{r.events} 件</Text> : <Text size="sm" c="dimmed">—</Text>}</Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </Table.ScrollContainer>
  );
}

/** Earlier imports (GET /api/exams/batches): clinic, file and counts only, no exam content. */
function ImportHistory() {
  const batches = useQuery(examBatchesQuery);
  return (
    <Card>
      <Text fw={600} size="lg" mb="sm">匯入紀錄</Text>
      {batches.isPending ? <Skeleton h={100} /> : batches.isError ? <CardNote>{problemText(batches.error)}</CardNote> : batches.data.length === 0 ? (
        <CardNote>還沒有匯入過健檢結果。</CardNote>
      ) : (
        <Table.ScrollContainer minWidth={640}>
          <Table verticalSpacing="sm">
            <Table.Thead>
              <Table.Tr><Table.Th>匯入時間</Table.Th><Table.Th>健檢醫院</Table.Th><Table.Th>檔案</Table.Th><Table.Th ta="right">資料列</Table.Th><Table.Th ta="right">健檢筆數</Table.Th><Table.Th>匯入人員</Table.Th></Table.Tr>
            </Table.Thead>
            <Table.Tbody>
              {batches.data.map(b => (
                <Table.Tr key={b.id}>
                  <Table.Td style={{ whiteSpace: 'nowrap' }}>{dateTime(b.importedAt)}</Table.Td>
                  <Table.Td>{b.clinic}</Table.Td>
                  <Table.Td><Text size="sm" style={{ overflowWrap: 'anywhere' }}>{b.fileName ?? '—'}</Text></Table.Td>
                  <Table.Td ta="right">{b.rowCount ?? '—'}</Table.Td>
                  <Table.Td ta="right">{b.exams}</Table.Td>
                  <Table.Td>{b.importedBy ?? '—'}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Table.ScrollContainer>
      )}
    </Card>
  );
}

/** The headers this clinic's file is read with (first sheet, header row 1), and a blank file with exactly those. */
function MappingHint({ mapping }: { mapping: ExamMapping }) {
  const { columns, items } = mappingColumns(mapping.mapping);
  const [showItems, setShowItems] = useState(false);
  const template = useMutation({ mutationFn: downloadExamTemplate });
  return (
    <div>
      <Group justify="space-between" gap="xs" mb={6}>
        <Text size="sm" c="dimmed">檔案第一個工作表的第一列需要這些欄名：</Text>
        <Group gap="xs">
          {template.isError && (
            <Text size="xs" c="var(--yutis-bad)" role="alert">
              {template.error instanceof ApiRequestError && template.error.code === 'mapping_not_found' ? actionErrorText(template.error) : '暫時無法下載範本，請稍後再試。'}
            </Text>
          )}
          <Button size="compact-sm" variant="default" leftSection={<IconDownload size={14} />} loading={template.isPending}
            onClick={() => template.mutate(mapping)}>下載空白範本</Button>
        </Group>
      </Group>
      <Group gap={6}>
        {columns.map(c => (
          <Badge key={c.label} size="lg" variant="light" color={c.required ? 'yutis' : 'gray'} styles={{ root: { textTransform: 'none', fontWeight: 500 } }}>
            {c.label}：{c.header}{c.required ? '（必填）' : ''}
          </Badge>
        ))}
        {items.length > 0 && <Button size="compact-sm" variant="subtle" color="yutis" onClick={() => setShowItems(s => !s)}>{showItems ? '收起' : `健檢項目 ${items.length} 項`}</Button>}
      </Group>
      <Collapse expanded={showItems}>
        <Group gap={6} mt={6}>
          {items.map(i => <Badge key={i.label} size="lg" variant="outline" color="gray" styles={{ root: { textTransform: 'none', fontWeight: 500 } }}>{i.label}：{i.header}</Badge>)}
        </Group>
      </Collapse>
    </div>
  );
}
