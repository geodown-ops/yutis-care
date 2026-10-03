import { Card, Text } from '@mantine/core';
import type { ReactNode } from 'react';

/** KPI tile. `highlight` fills it with the primary colour; use it for at most one tile per row. */
export function StatCard({ label, value, note, noteTone, highlight = false }: {
  label: ReactNode; value: number | string; note?: string; noteTone?: 'up' | 'down'; highlight?: boolean;
}) {
  const fg = highlight ? 'var(--mantine-primary-color-contrast)' : undefined;
  const noteColor = highlight ? fg : noteTone === 'up' ? 'var(--yutis-bad)' : noteTone === 'down' ? 'var(--yutis-ok)' : 'dimmed';
  return (
    <Card bg={highlight ? 'var(--mantine-primary-color-filled)' : undefined} c={fg}>
      <Text size="xs" c={highlight ? fg : 'dimmed'} style={{ opacity: highlight ? 0.85 : 1 }}>{label}</Text>
      <Text fz={28} fw={700} lh={1.25}>{value}</Text>
      {note && <Text size="xs" fw={600} c={noteColor}>{note}</Text>}
    </Card>
  );
}
