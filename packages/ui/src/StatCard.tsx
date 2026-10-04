import { Box, Card, Text } from '@mantine/core';
import type { ReactNode } from 'react';

export type TileTone = 'lavender' | 'mint' | 'pink' | 'blue';

/**
 * Overview figure. With `tone` it is a pastel tile (place tiles inside a white card, as in the reference's
 * status overview) and the note becomes a pill; without it, a plain white card.
 */
export function StatCard({ label, value, note, noteTone, tone }: {
  label: ReactNode; value: number | string; note?: string; noteTone?: 'up' | 'down'; tone?: TileTone;
}) {
  if (tone) {
    return (
      <Box p="md" style={{ background: `var(--yutis-tile-${tone})`, borderRadius: 'var(--mantine-radius-md)' }}>
        <Text size="sm" fw={500}>{label}</Text>
        <Text fz={30} fw={600} lh={1.3}>{value}</Text>
        {note && (
          <Text component="span" size="xs" fw={500} px={10} py={3} mt={6} display="inline-block"
            style={{ background: `var(--yutis-tile-${tone}-strong)`, borderRadius: 999 }}>{note}</Text>
        )}
      </Box>
    );
  }
  const noteColor = noteTone === 'up' ? 'var(--yutis-bad)' : noteTone === 'down' ? 'var(--yutis-ok)' : 'dimmed';
  return (
    <Card>
      <Text size="sm" c="dimmed">{label}</Text>
      <Text fz={30} fw={600} lh={1.3}>{value}</Text>
      {note && <Text size="xs" fw={600} c={noteColor}>{note}</Text>}
    </Card>
  );
}
