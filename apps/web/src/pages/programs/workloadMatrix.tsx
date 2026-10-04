/* The risk matrix and risk badge, drawn as the employee profile's WorkloadCard draws them. */
import { Badge, Box, Text } from '@mantine/core';
import { LOAD_LABEL, MATRIX, RISK_LABEL, type Level3 } from '@yutis/domain';
import { RISK_TONE } from './workload';

const CVD_BANDS = ['<10%', '10–20%', '≥20%'];

/** 10-year cardiovascular band (rows) × workload level (columns); the employee's cell is outlined. */
export function WorkloadMatrix({ band, load }: { band: Level3; load: Level3 }) {
  return (
    <Box style={{ display: 'grid', gridTemplateColumns: '64px repeat(3, 1fr)', gap: 4, textAlign: 'center', fontSize: 12 }} role="table" aria-label="異常工作負荷風險矩陣">
      <span />
      {LOAD_LABEL.map(l => <Text key={l} size="xs" c="dimmed" py={4}>{l}</Text>)}
      {MATRIX.map((row, b) => [
        <Text key={`h${b}`} size="xs" c="dimmed" py={10}>{CVD_BANDS[b]}</Text>,
        ...row.map((v, l) => {
          const here = b === band && l === load;
          const tone = RISK_TONE[v];
          return (
            <Box key={`${b}-${l}`} py={10} fw={600} aria-current={here ? 'true' : undefined} style={{
              borderRadius: 8, background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`,
              outline: here ? '2px solid var(--mantine-color-text)' : undefined, outlineOffset: -2,
            }}>{RISK_LABEL[v].slice(0, 1)}</Box>
          );
        }),
      ])}
    </Box>
  );
}

export function RiskBadge({ level, empty = '問卷未完成' }: { level: Level3 | null; empty?: string }) {
  if (level == null) return <Text span size="sm" c="dimmed">{empty}</Text>;
  const tone = RISK_TONE[level];
  return <Badge styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none' } }}>{RISK_LABEL[level]}</Badge>;
}

export function LoadBadge({ level }: { level: Level3 | null | undefined }) {
  if (level == null) return <Text span size="sm" c="dimmed">—</Text>;
  const tone = RISK_TONE[level];
  return <Badge variant="outline" styles={{ root: { borderColor: `var(--yutis-${tone})`, color: `var(--yutis-${tone})`, textTransform: 'none', flexShrink: 0, overflow: 'visible' }, label: { overflow: 'visible' } }}>{LOAD_LABEL[level]}</Badge>;
}
