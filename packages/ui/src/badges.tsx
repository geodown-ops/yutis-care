import { Badge, Box } from '@mantine/core';
import type { CaseStatus, Grade } from '@yutis/domain';

const GRADE_LABEL: Record<Grade, string> = { 1: '正常', 2: '輕度異常', 3: '中度異常', 4: '嚴重異常' };

/** Health-check grade as a numbered square, so the level never depends on colour alone. */
export function GradeBadge({ grade }: { grade: Grade | null }) {
  if (grade == null) return <Box component="span" c="dimmed">—</Box>;
  return (
    <Box
      component="span"
      title={`${grade} 級：${GRADE_LABEL[grade]}`}
      aria-label={`${grade} 級，${GRADE_LABEL[grade]}`}
      style={{
        display: 'inline-grid', placeItems: 'center', width: 22, height: 22, borderRadius: 6,
        background: `var(--yutis-grade${grade})`, color: `var(--yutis-grade${grade}-fg)`, fontWeight: 700, fontSize: 12,
      }}
    >
      {grade}
    </Box>
  );
}

export const CASE_STATUS_TONE: Record<CaseStatus, 'bad' | 'info' | 'warn' | 'ok'> = {
  未開單: 'bad', 起單: 'info', 處理中: 'warn', 結案: 'ok',
};

export function CaseStatusBadge({ status }: { status: CaseStatus }) {
  const tone = CASE_STATUS_TONE[status];
  return (
    <Badge
      leftSection={<Box component="span" w={6} h={6} style={{ borderRadius: '50%', background: 'currentColor' }} />}
      styles={{ root: { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})`, textTransform: 'none', fontWeight: 600, height: 24, paddingInline: 10 } }}
    >
      {status}
    </Badge>
  );
}
