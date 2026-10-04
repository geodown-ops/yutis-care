/* Toolbar pieces shared by the ergonomics and workload lists. */
import { Button, Select } from '@mantine/core';
import { IconDownload } from '@tabler/icons-react';
import { orgOptions, type OrgFilter } from './lists';

/** 廠區 and 部門 filters over the names in the list; a filter with only one choice is left out. */
export function OrgFilterSelects({ rows, value, onChange }: {
  rows: readonly { site: string; department: string }[]; value: OrgFilter; onChange: (f: OrgFilter) => void;
}) {
  const { sites, departments } = orgOptions(rows, value.site);
  return (
    <>
      {(sites.length > 1 || value.site) && (
        <Select size="xs" aria-label="廠區" placeholder="全部廠區" clearable w={130} data={sites} value={value.site}
          onChange={site => onChange({ site, department: null })} />
      )}
      {(departments.length > 1 || value.department) && (
        <Select size="xs" aria-label="部門" placeholder="全部部門" clearable searchable w={150} data={departments} value={value.department}
          onChange={department => onChange({ ...value, department })} nothingFoundMessage="沒有這個部門" />
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
