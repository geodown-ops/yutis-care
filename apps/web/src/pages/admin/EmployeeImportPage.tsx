import { Alert, Card, Grid, SimpleGrid, Stack, Table, Text } from '@mantine/core';
import { useQueryClient } from '@tanstack/react-query';
import { StatCard } from '@yutis/ui';
import { AnchorLink } from '../../links';
import type { EmployeeImportReport } from './imports';
import { ImportFlow } from './ImportFlow';
import { importEmployees } from './queries';
import { AdminTitle } from './ui';

/** The columns the API reads (EMPLOYEE_COLUMNS in apps/api/src/admin/employees.controller.ts). */
const REQUIRED: [string, string][] = [
  ['工號', '依工號新增或更新'],
  ['姓名', ''],
  ['性別', '男、女'],
  ['出生日期', 'YYYY-MM-DD'],
  ['法人代碼', '組織架構的法人代碼'],
  ['廠區代碼', '需屬於該法人'],
  ['部門', '該廠區的部門名稱'],
];
const OPTIONAL: [string, string][] = [
  ['身分證字號', '只保存遮罩與比對健檢檔用的指紋，不保存原值'],
  ['職稱', ''],
  ['班別', ''],
  ['健檢類別', ''],
  ['特殊作業', '多項以「、」分隔'],
  ['語言', '員工端語言：zh、en、ja、vi、th，空白為 zh'],
  ['到職日', 'YYYY-MM-DD'],
  ['Email', '員工登入員工端用'],
  ['手機', '員工登入員工端用'],
  ['狀態', '在職、留停、離職，空白為在職'],
];

/** 員工匯入: the employee master from Excel, checked first and written only after the admin confirms. */
export function EmployeeImportPage() {
  const qc = useQueryClient();
  return (
    <Stack gap="lg">
      <AdminTitle title="員工匯入" description="以 Excel 新增或更新員工主檔。檔案裡沒有的員工不會被刪除，離職請在「狀態」欄填「離職」。" />
      <Grid gap="md">
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Card>
            <Text fw={600} size="lg" mb={4}>上傳檔案</Text>
            <Text size="sm" c="dimmed" mb="md">先檢查整份檔案，確認後才寫入。有任何一列錯誤就整份不匯入。</Text>
            <ImportFlow<EmployeeImportReport>
              upload={importEmployees}
              hasChanges={r => r.create + r.update > 0}
              onCommitted={() => void qc.invalidateQueries({ queryKey: ['employees'] })}
              doneText={r => `已匯入：新增 ${r.create} 人、更新 ${r.update} 人。`}
              summary={r => <EmployeeImportSummary report={r} />}
            />
          </Card>
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 5 }}>
          <Card>
            <Text fw={600} size="lg" mb={4}>檔案格式</Text>
            <Text size="sm" c="dimmed" mb="sm">
              讀取第一個工作表，第一列為欄位名稱。法人、廠區與部門要先在<AnchorLink to="/admin/org" size="sm">組織架構</AnchorLink>建立。
            </Text>
            <ColumnTable title="必填欄位" rows={REQUIRED} />
            <ColumnTable title="選填欄位" rows={OPTIONAL} />
          </Card>
        </Grid.Col>
      </Grid>
    </Stack>
  );
}

function ColumnTable({ title, rows }: { title: string; rows: [string, string][] }) {
  return (
    <>
      <Text size="sm" fw={600} mt="sm" mb={4}>{title}</Text>
      <Table verticalSpacing={4} fz="sm">
        <Table.Tbody>
          {rows.map(([col, hint]) => (
            <Table.Tr key={col}><Table.Td w={110} fw={500}>{col}</Table.Td><Table.Td c="dimmed">{hint}</Table.Td></Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
    </>
  );
}

function EmployeeImportSummary({ report }: { report: EmployeeImportReport }) {
  const { seats } = report;
  return (
    <Stack gap="sm">
      <SimpleGrid cols={{ base: 2, sm: 4 }} spacing="sm">
        <StatCard tone="lavender" label="資料列" value={report.rows} />
        <StatCard tone="mint" label={report.committed ? '已新增' : '將新增'} value={report.create} />
        <StatCard tone="blue" label={report.committed ? '已更新' : '將更新'} value={report.update} />
        <StatCard tone="pink" label="不變" value={report.unchanged} />
      </SimpleGrid>
      {/* A file with problems imports nothing, so a projected headcount would only confuse. */}
      {(report.committed || report.issues.length === 0) && (
        <Text size="sm">
          {report.committed ? '匯入後' : '匯入後預計'}在職 {seats.activeEmployees} 人{seats.seatLimit != null ? `，訂閱人數上限 ${seats.seatLimit} 人` : ''}。
        </Text>
      )}
      {seats.overLimit && report.issues.length === 0 && (
        <Alert color="yellow" variant="light" p="sm">在職人數超過訂閱上限。仍可匯入，請與 Yutis 聯絡調整方案。</Alert>
      )}
    </Stack>
  );
}
