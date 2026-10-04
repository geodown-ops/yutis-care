import { Box, Button, Card, Group, Progress, SegmentedControl, SimpleGrid, Stack, Text, Title, UnstyledButton } from '@mantine/core';
import { createLink } from '@tanstack/react-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LanguageSelect } from './LanguageSelect';
import { nmqComplete, nmqQuestions, type NmqAnswers } from './nmq-flow';

const ButtonLink = createLink(Button<'a'>);

/**
 * NMQ, one screen per step: first the two yes/no questions, then one body part per screen with
 * large 0–5 targets. Answers are kept in memory; the API will save each step as a draft.
 */
export function NmqPage() {
  const { t } = useTranslation('nmq');
  const { t: ta } = useTranslation('app');
  const [step, setStep] = useState(0);
  const [a, setA] = useState<NmqAnswers>({ any: null, injury: null, scores: {} });
  const [submitted, setSubmitted] = useState(false);
  const questions = nmqQuestions(t);
  const total = questions.length + 1;
  const last = step === total - 1;
  const q = step > 0 ? questions[step - 1]! : null;
  const canNext = q ? a.scores[q.key] !== undefined : a.any != null && a.injury != null;
  const scale = t('scale', { returnObjects: true }) as string[];

  if (submitted) {
    return (
      <Stack p="md" gap="md" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
        <Title order={3}>{t('title')}</Title>
        <Card><Text>{t('done')}</Text><Text size="sm" c="dimmed" mt={4}>{ta('flow.privacy')}</Text></Card>
        <ButtonLink to="/" variant="light">{ta('flow.back')}</ButtonLink>
      </Stack>
    );
  }

  const yesNo = (field: 'any' | 'injury', label: string) => (
    <Stack gap={8}>
      <Text fw={600}>{label}</Text>
      <SegmentedControl fullWidth size="md" value={a[field] == null ? '' : a[field] ? 'y' : 'n'}
        onChange={v => setA(s => ({ ...s, [field]: v === 'y' }))}
        data={[{ value: 'y', label: t('yes') }, { value: 'n', label: t('no') }]} aria-label={label} />
    </Stack>
  );

  return (
    <Stack gap={0} mih="100dvh">
      <Box bg="var(--yutis-surface)" px="md" pb="sm" style={{ borderBottom: '1px solid var(--yutis-line)', paddingTop: 'calc(env(safe-area-inset-top, 0px) + 16px)' }}>
        <Group justify="space-between" mb={8} wrap="nowrap">
          <Text fw={700}>{t('title')}</Text>
          <LanguageSelect />
        </Group>
        <Group gap="sm" wrap="nowrap">
          <Progress value={((step + 1) / total) * 100} size="sm" radius="xl" style={{ flex: 1 }} aria-label={ta('flow.progress')} />
          <Text size="sm" c="dimmed">{step + 1} / {total}</Text>
        </Group>
      </Box>

      <Stack gap="lg" p="md" style={{ flex: 1 }}>
        {q ? (
          <>
            <Text size="sm" c="dimmed">{t('partsTitle')}</Text>
            <Text fz={22} fw={700}>{q.label}</Text>
            <SimpleGrid cols={3} spacing={8} role="radiogroup" aria-label={q.label}>
              {scale.map((label, n) => {
                const on = a.scores[q.key] === n;
                return (
                  <UnstyledButton key={n} role="radio" aria-checked={on} onClick={() => setA(s => ({ ...s, scores: { ...s.scores, [q.key]: n } }))}
                    p={10} mih={64} style={{
                      borderRadius: 'var(--mantine-radius-md)', border: `1px solid ${on ? 'var(--mantine-primary-color-filled)' : 'var(--yutis-line)'}`,
                      background: on ? 'var(--mantine-primary-color-filled)' : 'var(--yutis-surface)', color: on ? 'var(--mantine-primary-color-contrast)' : undefined,
                    }}>
                    <Text fz={20} fw={700} lh={1.1}>{n}</Text>
                    <Text size="xs" lh={1.3} c={on ? undefined : 'dimmed'}>{label}</Text>
                  </UnstyledButton>
                );
              })}
            </SimpleGrid>
          </>
        ) : (
          <>
            {yesNo('any', t('q1'))}
            {yesNo('injury', t('injury'))}
          </>
        )}
      </Stack>

      <Group p="md" grow style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}>
        <Button variant="default" size="md" disabled={step === 0} onClick={() => setStep(s => s - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!nmqComplete(a)} onClick={() => setSubmitted(true)}>{t('submit')}</Button>
          : <Button size="md" disabled={!canNext} onClick={() => setStep(s => s + 1)}>{ta('flow.next')}</Button>}
      </Group>
    </Stack>
  );
}
