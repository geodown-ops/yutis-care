/*
 * Excel import in two steps: the API checks the file and reports what it would change (nothing is written), then the
 * admin confirms and the same file is sent again with commit=true. Any problem row means nothing is imported.
 */
import { Alert, Button, FileButton, Group, Stack, Table, Text } from '@mantine/core';
import { IconCircleCheck, IconFileSpreadsheet, IconUpload } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { useRef, useState, type ReactNode } from 'react';
import { fileProblem, fileSize, issueWhere, rowsWithIssues, sortIssues, type ImportIssue } from './imports';
import { refusedImportReport } from './problems';
import { ErrorNote } from './ui';

const SHOWN_ISSUES = 200;

export function ImportFlow<R extends { committed: boolean; issues: ImportIssue[] }>({ upload, summary, hasChanges, onCommitted, doneText }: {
  upload: (file: File, commit: boolean) => Promise<R>;
  /** What the file would change (preview) or changed (after commit). */
  summary: (report: R) => ReactNode;
  hasChanges: (report: R) => boolean;
  onCommitted?: (report: R) => void;
  doneText: (report: R) => string;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const reset = useRef<() => void>(null);
  const preview = useMutation({ mutationFn: (f: File) => upload(f, false) });
  const commit = useMutation({ mutationFn: (f: File) => upload(f, true), onSuccess: r => onCommitted?.(r) });

  const choose = (f: File | null) => {
    reset.current?.();
    if (!f) return;
    const problem = fileProblem(f);
    setPicked(problem);
    setFile(problem ? null : f);
    preview.reset();
    commit.reset();
    if (!problem) preview.mutate(f);
  };
  const startOver = () => { setFile(null); setPicked(null); preview.reset(); commit.reset(); };

  const report = commit.data ?? preview.data;
  const refused = refusedImportReport<R>(commit.error);
  const issues = refused?.issues ?? report?.issues ?? [];

  return (
    <Stack gap="md">
      <Group gap="sm" wrap="wrap">
        <FileButton onChange={choose} accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" resetRef={reset}>
          {props => <Button {...props} leftSection={<IconUpload size={16} />} variant={file ? 'default' : 'filled'} disabled={commit.isPending}>{file ? '重新選擇檔案' : '選擇 Excel 檔'}</Button>}
        </FileButton>
        {file && (
          <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
            <IconFileSpreadsheet size={18} color="var(--yutis-ok)" />
            <Text size="sm" truncate>{file.name}</Text>
            <Text size="sm" c="dimmed">{fileSize(file.size)}</Text>
          </Group>
        )}
      </Group>
      {picked && <Alert color="red" variant="light" p="sm">{picked}</Alert>}
      {preview.isPending && <Text size="sm" c="dimmed">正在檢查檔案…</Text>}
      {preview.isError && <ErrorNote error={preview.error} />}

      {commit.data ? (
        <Stack gap="md">
          <Alert color="green" variant="light" icon={<IconCircleCheck size={18} />} p="sm" styles={{ message: { color: 'var(--yutis-fg)' } }}>{doneText(commit.data)}</Alert>
          {summary(commit.data)}
          <Group><Button variant="default" onClick={startOver}>匯入另一個檔案</Button></Group>
        </Stack>
      ) : report && (
        <Stack gap="md">
          {summary(report)}
          {issues.length > 0 ? (
            <Alert color="red" variant="light" p="sm" title={`${rowsWithIssues(issues)} 列有問題，整份檔案不會匯入`}>
              請在 Excel 修正下列問題後，重新選擇檔案。
            </Alert>
          ) : hasChanges(report) ? (
            <Group justify="space-between" gap="sm">
              <Text size="sm">檢查通過，資料還沒有寫入。確認後才會匯入。</Text>
              <Button loading={commit.isPending} onClick={() => file && commit.mutate(file)}>確認匯入</Button>
            </Group>
          ) : (
            <Text size="sm" c="dimmed">檔案內容與目前資料相同，不需要匯入。</Text>
          )}
          {commit.isError && !refused && <ErrorNote error={commit.error} />}
        </Stack>
      )}
      {issues.length > 0 && <IssuesTable issues={issues} />}
    </Stack>
  );
}

function IssuesTable({ issues }: { issues: ImportIssue[] }) {
  const sorted = sortIssues(issues);
  return (
    <>
      <Table.ScrollContainer minWidth={480}>
        <Table verticalSpacing={6} striped>
          <Table.Thead><Table.Tr><Table.Th w={240}>位置</Table.Th><Table.Th>問題</Table.Th></Table.Tr></Table.Thead>
          <Table.Tbody>
            {sorted.slice(0, SHOWN_ISSUES).map((i, k) => (
              <Table.Tr key={k}><Table.Td fz="sm">{issueWhere(i)}</Table.Td><Table.Td fz="sm">{i.message}</Table.Td></Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {sorted.length > SHOWN_ISSUES && <Text size="sm" c="dimmed">只列出前 {SHOWN_ISSUES} 項，還有 {sorted.length - SHOWN_ISSUES} 項。</Text>}
    </>
  );
}
