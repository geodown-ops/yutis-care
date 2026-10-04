/* Toolbar pieces shared by the programme lists. */
import { Button, Group, Modal, Select, Stack, Text } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import type { UseMutationResult } from '@tanstack/react-query';
import type { Schemas } from '@yutis/api-client';
import { orgOptions, reminderText, type OrgFilter, type OrgNames, type OrgPlace } from './lists';
import { saveProblem } from './maternalViolenceCommon';

/** 廠區 and 部門 filters over the sites and departments in the list (by id); a filter with only one choice is left out. */
export function OrgFilterSelects({ rows, names, value, onChange }: {
  rows: readonly OrgPlace[]; names: OrgNames; value: OrgFilter; onChange: (f: OrgFilter) => void;
}) {
  const { sites, departments } = orgOptions(rows, value.siteId, names);
  return (
    <>
      {(sites.length > 1 || value.siteId) && (
        <Select size="xs" aria-label="廠區" placeholder="全部廠區" clearable w={130} data={sites} value={value.siteId}
          onChange={siteId => onChange({ siteId, departmentId: null })} />
      )}
      {(departments.length > 1 || value.departmentId) && (
        <Select size="xs" aria-label="部門" placeholder="全部部門" clearable searchable w={170} data={departments} value={value.departmentId}
          onChange={departmentId => onChange({ ...value, departmentId })} nothingFoundMessage="沒有這個部門" />
      )}
    </>
  );
}

export function ExportButton({ count, onExport }: { count: number; onExport: () => void }) {
  return (
    <Button size="xs" variant="default" leftSection={<IconDownload size={14} />} disabled={!count} onClick={onExport}>
      匯出 CSV
    </Button>
  );
}

type Remind = UseMutationResult<Schemas['RemindResultDto'], Error, string[]>;

/** 未填寫通知: confirm, send, and hand back what to tell the nurse (who had no email). */
export function RemindModal({ opened, rows, what, send, onClose, onDone }: {
  opened: boolean; rows: readonly { id: string; employeeId: string; name: string }[]; what: string; send: Remind;
  onClose: () => void; onDone: (text: string) => void;
}) {
  const names = new Map(rows.map(r => [r.employeeId, r.name]));
  const close = () => { send.reset(); onClose(); };
  return (
    <Modal opened={opened} onClose={close} title="未填寫通知">
      <Stack gap="md">
        <Text size="sm">寄提醒信給 {rows.length} 位還沒填完{what}的員工：{rows.slice(0, 10).map(r => r.name).join('、')}{rows.length > 10 ? ' 等' : ''}。</Text>
        <Text size="xs" c="dimmed">信中只說有問卷待填，不含問卷名稱與健康內容。沒有 Email 的員工會列出來，請另行通知。</Text>
        {send.isError && <Text size="sm" c="var(--yutis-bad)" role="alert">{saveProblem(send.error)}</Text>}
        <Group justify="flex-end">
          <Button variant="default" onClick={close}>取消</Button>
          <Button loading={send.isPending} disabled={!rows.length}
            onClick={() => send.mutate(rows.map(r => r.id), {
              onSuccess: r => { send.reset(); onDone(reminderText(r, r.noEmail.map(id => names.get(id) ?? '一位員工'))); },
            })}>
            寄出
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
