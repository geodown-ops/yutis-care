import { Alert, Badge, Box, Button, Card, Center, Loader, Progress, Stack, Text, type ButtonProps } from '@mantine/core';
import { IconAlertTriangle, IconCircleCheck, IconInfoCircle, IconLock } from '@tabler/icons-react';
import { useState, type ReactNode } from 'react';
import { errorMessage } from './errors';
import { formatCount } from './format';
import type { Label, Tone } from './labels';
import { seatUsage } from './tenants';

const toneColors = (tone: Tone) => tone === 'neutral'
  ? { background: 'var(--yutis-surface2)', color: 'var(--yutis-muted)' }
  : { background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})` };

/** A status pill in the --yutis-* status colours, sized like CaseStatusBadge in @yutis/ui. */
export function ToneBadge({ tone, children }: { tone: Tone; children: ReactNode }) {
  return (
    <Badge styles={{ root: { ...toneColors(tone), textTransform: 'none', fontWeight: 600, fontSize: 12, height: 24, paddingInline: 10, flexShrink: 0 } }}>
      {children}
    </Badge>
  );
}

export const LabelBadge = ({ value }: { value: Label }) => <ToneBadge tone={value.tone}>{value.label}</ToneBadge>;

const ALERT_ICON = { ok: IconCircleCheck, info: IconInfoCircle, warn: IconAlertTriangle, bad: IconAlertTriangle } as const;

/** A tinted notice in the status colours; `bad` for failures, `warn` for things that need doing. */
export function ToneAlert({ tone, title, children }: { tone: Exclude<Tone, 'neutral'>; title?: ReactNode; children?: ReactNode }) {
  const Icon = ALERT_ICON[tone];
  return (
    <Alert icon={<Icon size={18} />} title={title} radius="md" styles={{
      root: { background: `var(--yutis-${tone}-weak)` },
      icon: { color: `var(--yutis-${tone})` },
      title: { color: `var(--yutis-${tone})`, fontWeight: 600 },
      message: { color: 'var(--mantine-color-text)' },
    }}>
      {children}
    </Alert>
  );
}

/** The confirm button of a destructive action (suspend, delete), in the `bad` status colour. */
export const DangerButton = (props: ButtonProps & { onClick?: () => void }) => (
  <Button {...props} styles={{ root: { background: 'var(--yutis-bad)', color: 'var(--yutis-surface)' } }} />
);

/** Opens a destructive action: a quiet button with `bad` text. */
export const DangerOutlineButton = (props: ButtonProps & { onClick?: () => void }) => (
  <Button variant="default" {...props} styles={{ root: { color: 'var(--yutis-bad)' } }} />
);

/** A failed request or action, in plain Chinese. */
export const ErrorAlert = ({ error }: { error: unknown }) => <ToneAlert tone="bad">{errorMessage(error)}</ToneAlert>;

export function PageLoader() {
  return <Center py={80}><Loader color="yutis" aria-label="載入中" /></Center>;
}

/** A page whose data could not load. A role without permission gets an explanation instead of a retry. */
export function LoadError({ error, onRetry, forbidden }: { error: unknown; onRetry: () => void; forbidden?: string }) {
  if (forbidden) {
    return (
      <Card>
        <Stack align="center" gap="xs" py="xl">
          <IconLock size={28} color="var(--yutis-muted)" />
          <Text fw={600}>沒有權限</Text>
          <Text c="dimmed" size="sm" ta="center" maw={420}>{forbidden}</Text>
        </Stack>
      </Card>
    );
  }
  return (
    <Card>
      <Stack align="center" gap="sm" py="xl">
        <Text c="dimmed" ta="center">{errorMessage(error)}</Text>
        <Button variant="default" onClick={onRetry}>重新載入</Button>
      </Stack>
    </Card>
  );
}

/** Employees against the seat limit; over the limit turns the bar red (a reminder, nothing is blocked). */
export function SeatBar({ activeEmployees, seatLimit, w = 140 }: { activeEmployees: number; seatLimit: number | null; w?: number | string }) {
  const { percent, over } = seatUsage(activeEmployees, seatLimit);
  return (
    <Box w={w}>
      <Text size="sm" c={over ? 'var(--yutis-bad)' : undefined} fw={over ? 600 : undefined}>
        {formatCount(activeEmployees)} / {seatLimit == null ? '不限' : formatCount(seatLimit)}
      </Text>
      {percent != null && (
        <Progress value={percent} size="xs" mt={4} color={over ? 'var(--yutis-bad)' : undefined} aria-label={over ? '超過人數上限' : '人數用量'} />
      )}
    </Box>
  );
}

/**
 * A modal's open state and what it is for. The target outlives closing, so the content stays put during the close
 * transition; Mantine unmounts it afterwards, so the next opening starts a fresh form.
 */
export function useDialog<T>() {
  const [state, setState] = useState<{ opened: boolean; target: T | null }>({ opened: false, target: null });
  return {
    opened: state.opened,
    target: state.target,
    open: (target: T) => setState({ opened: true, target }),
    close: () => setState(s => ({ ...s, opened: false })),
  };
}

/** Dimmed explanatory text under a page. */
export const Footnote = ({ children }: { children: ReactNode }) => <Text size="xs" c="dimmed">{children}</Text>;
