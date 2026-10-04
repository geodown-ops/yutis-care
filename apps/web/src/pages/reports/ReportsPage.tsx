import { BarChart } from '@mantine/charts';
import { Box, Button, Card, Chip, Grid, Group, Select, SimpleGrid, Skeleton, Stack, Table, Tabs, Text, Title } from '@mantine/core';
import { IconEyeOff, IconFileSpreadsheet, IconFileTypePdf } from '@tabler/icons-react';
import { keepPreviousData, useMutation, useQuery, useQueryClient, useSuspenseQuery } from '@tanstack/react-query';
import { StatCard, type TileTone } from '@yutis/ui';
import { useMe } from '../../session';
import { CardNote, problemText } from '../states';
import { ExportsCard } from './ExportsCard';
import { exportsQuery, reportTypesQuery, requestExport, siteReportQuery } from './queries';
import { cellText, chartOf, groupCatalogue, pickReport, type Report, type ReportKind, type ReportType } from './report';

export interface ReportsSearch { kind?: ReportKind; type?: string; site?: string }

const TONES: TileTone[] = ['lavender', 'blue', 'mint', 'pink'];
// Two series: link lavender and sky blue pass the colour-vision checks side by side; one series uses the brand colour.
const SERIES_COLOR = [['var(--yutis-chart1)'], ['var(--yutis-link)', 'var(--yutis-chart3)']];

/** 統計報表: the 16 reports by kind, narrowed to one of my sites, with Excel/PDF export. */
export function ReportsPage({ search, onSearch }: { search: ReportsSearch; onSearch: (next: ReportsSearch) => void }) {
  const me = useMe();
  const { data: types } = useSuspenseQuery(reportTypesQuery);
  const groups = groupCatalogue(types);
  const current = pickReport(groups, search.kind, search.type);
  const sites = [...me.sites, ...me.breakGlassSites.filter(b => !me.sites.some(s => s.id === b.id))];
  const siteId = sites.some(s => s.id === search.site) ? search.site : undefined;

  return (
    <Stack gap="lg">
      <Group justify="space-between" align="center">
        <Title order={2}>統計報表</Title>
        {sites.length > 1 && (
          <Select aria-label="廠區" placeholder="全部負責廠區" clearable w={180} value={siteId ?? null}
            data={sites.map(s => ({ value: s.id, label: s.name }))} onChange={v => onSearch({ ...search, site: v ?? undefined })} />
        )}
      </Group>

      <Card pb="md">
        <Tabs value={current?.kind ?? null} onChange={v => onSearch({ ...search, kind: (v ?? undefined) as ReportKind | undefined, type: undefined })}>
          <Tabs.List>{groups.map(g => <Tabs.Tab key={g.kind} value={g.kind}>{g.label}</Tabs.Tab>)}</Tabs.List>
        </Tabs>
        {current && (
          <Chip.Group value={current.type} onChange={v => onSearch({ ...search, kind: current.kind, type: v as string })}>
            <Group gap={6} mt="md">
              {groups.find(g => g.kind === current.kind)!.types.map(t => <Chip key={t.type} value={t.type} size="xs">{t.title}</Chip>)}
            </Group>
          </Chip.Group>
        )}
      </Card>

      {current ? (
        <ReportCard key={`${current.kind}/${current.type}`} report={current} siteId={siteId}
          scope={siteId ? sites.find(s => s.id === siteId)!.name : sites.map(s => s.name).join('、') || '尚未指派負責廠區'} />
      ) : <Card><CardNote>目前沒有可用的報表。</CardNote></Card>}

      <ExportsCard />
    </Stack>
  );
}

function ReportCard({ report: rt, siteId, scope }: { report: ReportType; siteId?: string; scope: string }) {
  const qc = useQueryClient();
  const report = useQuery({ ...siteReportQuery(rt.kind, rt.type, siteId), placeholderData: keepPreviousData });
  const exp = useMutation({
    mutationFn: (format: 'xlsx' | 'pdf') => requestExport(rt.kind, rt.type, format, siteId),
    onSuccess: () => qc.invalidateQueries({ queryKey: exportsQuery.queryKey }),
  });

  return (
    <Card>
      <Group justify="space-between" align="flex-start" mb="md" gap="sm">
        <div>
          <Text fw={600} size="lg">{rt.title}</Text>
          <Text size="xs" c="dimmed">{scope} · 依目前資料即時計算</Text>
        </div>
        <Stack gap={4} align="flex-end">
          <Group gap="xs">
            <Button size="xs" variant="default" leftSection={<IconFileSpreadsheet size={14} />} loading={exp.isPending && exp.variables === 'xlsx'} disabled={exp.isPending} onClick={() => exp.mutate('xlsx')}>匯出 Excel</Button>
            <Button size="xs" variant="default" leftSection={<IconFileTypePdf size={14} />} loading={exp.isPending && exp.variables === 'pdf'} disabled={exp.isPending} onClick={() => exp.mutate('pdf')}>匯出 PDF</Button>
          </Group>
          {exp.isSuccess && <Text size="xs" c="dimmed" role="status">已排入匯出，完成後在下方「我的匯出」下載。</Text>}
          {exp.isError && <Text size="xs" c="var(--yutis-bad)" role="alert">{problemText(exp.error)}</Text>}
        </Stack>
      </Group>

      {report.isPending ? <Skeleton h={260} /> : report.isError ? <CardNote>{problemText(report.error)}</CardNote> : (
        <Box style={{ opacity: report.isPlaceholderData ? 0.6 : 1 }}>
          <ReportBody report={report.data} />
        </Box>
      )}
    </Card>
  );
}

function ReportBody({ report }: { report: Report }) {
  const chart = chartOf(report);
  const colors = SERIES_COLOR[(chart?.series.length ?? 1) - 1]!;
  return (
    <Stack gap="md">
      {report.suppressed && (
        <Group gap="sm" wrap="nowrap" align="flex-start" p="sm" role="note"
          style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--yutis-info-weak)', color: 'var(--yutis-info)' }}>
          <IconEyeOff size={18} style={{ flexShrink: 0, marginTop: 2 }} />
          <Text size="sm" c="inherit">去識別統計：人數少於 5 人的格子，以及可由它推算出來的格子，都以「—」表示不顯示。</Text>
        </Group>
      )}
      <SimpleGrid cols={{ base: Math.min(report.summary.length, 2) || 1, sm: Math.min(report.summary.length, 3) || 1 }} spacing="sm">
        {report.summary.map((s, i) => <StatCard key={i} tone={TONES[i % TONES.length]} label={s.label ?? ''} value={cellText(s.value)} />)}
      </SimpleGrid>
      <Grid gap="lg">
        <Grid.Col span={{ base: 12, lg: 5 }}>
          {chart ? (
            <BarChart h={Math.max(160, chart.data.length * (chart.series.length > 1 ? 44 : 34) + 40)} data={chart.data} dataKey="label" orientation="vertical"
              series={chart.series.map((s, i) => ({ name: s.key, label: s.label, color: colors[i]! }))}
              withLegend={chart.series.length > 1} legendProps={{ verticalAlign: 'top', height: 32 }}
              // Labels only render through valueFormatter; hidden (null) cells get none.
              withBarValueLabel valueFormatter={v => (v == null ? '' : String(v))} valueLabelProps={{ fill: 'var(--mantine-color-text)' }}
              gridAxis="none" tickLine="none" maxBarWidth={18} barProps={{ radius: 4 }}
              yAxisProps={{ width: 112, interval: 0 }} xAxisProps={{ allowDecimals: false }} />
          ) : <CardNote>{report.rows.length === 0 ? '目前沒有資料。' : report.suppressed ? '人數過少，沒有可以畫成圖的數字。' : '目前沒有可以畫成圖的數字。'}</CardNote>}
        </Grid.Col>
        <Grid.Col span={{ base: 12, lg: 7 }}>
          <Table.ScrollContainer minWidth={300}>
            <Table verticalSpacing={8} highlightOnHover>
              <Table.Thead>
                <Table.Tr>{report.columns.map((c, i) => <Table.Th key={i} ta={i ? 'right' : undefined}>{c}</Table.Th>)}</Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {report.rows.map((r, i) => (
                  <Table.Tr key={i}>
                    {r.map((v, j) => (
                      <Table.Td key={j} ta={j ? 'right' : undefined} c={v == null ? 'dimmed' : undefined} title={v == null && j ? '人數過少，不顯示' : undefined}
                        style={j ? { fontVariantNumeric: 'tabular-nums' } : undefined}>{cellText(v)}</Table.Td>
                    ))}
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
          {report.rows.length === 0 && <CardNote>目前沒有資料。</CardNote>}
        </Grid.Col>
      </Grid>
    </Stack>
  );
}
