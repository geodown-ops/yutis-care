import { Button, SegmentedControl, SimpleGrid, Stack, Text, UnstyledButton } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, healthQuery, tasksQuery } from './api';
import { FlowFrame, FlowMessage, submitProblem, taskGate, useOpenTask } from './Flow';
import { nmqBody, nmqComplete, nmqQuestions, type NmqAnswers } from './nmq-flow';

/**
 * NMQ, one screen per step: first the two yes/no questions, then one body part per screen with large 0–5 targets.
 * Answers stay in memory until the last step sends them (PUT /api/portal/ergo/{id}).
 */
export function NmqPage({ id }: { id: string }) {
  const { t } = useTranslation('nmq');
  const { t: ta } = useTranslation('app');
  const queryClient = useQueryClient();
  const open = useOpenTask('nmq', id);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<NmqAnswers>({ any: null, injury: null, scores: {} });
  const submit = useMutation({
    mutationFn: () => data(api.PUT('/api/portal/ergo/{id}', { params: { path: { id } }, body: nmqBody(a) })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthQuery.queryKey }),
  });
  const questions = nmqQuestions(t);
  const total = questions.length + 1;
  const last = step === total - 1;
  const q = step > 0 ? questions[step - 1]! : null;
  const canNext = q ? a.scores[q.key] !== undefined : a.any != null && a.injury != null;
  const scale = t('scale', { returnObjects: true }) as string[];

  if (submit.isSuccess) return <FlowMessage title={t('title')} message={t('done')} done />;
  if (submit.isError && submitProblem(submit.error) === 'already') return <FlowMessage title={t('title')} message={ta('flow.already')} />;
  const gate = taskGate(open, t('title'), ta('flow.missing'));
  if (gate) return gate;

  const yesNo = (field: 'any' | 'injury', label: string) => (
    <Stack gap={8}>
      <Text fw={600}>{label}</Text>
      <SegmentedControl fullWidth size="md" value={a[field] == null ? '' : a[field] ? 'y' : 'n'}
        onChange={v => setA(s => ({ ...s, [field]: v === 'y' }))}
        data={[{ value: 'y', label: t('yes') }, { value: 'n', label: t('no') }]} aria-label={label} />
    </Stack>
  );

  return (
    <FlowFrame title={t('title')} step={step} total={total} error={submit.isError ? ta('flow.failed') : null}
      footer={<>
        <Button variant="default" size="md" disabled={step === 0 || submit.isPending} onClick={() => setStep(s => s - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!nmqComplete(a)} loading={submit.isPending} onClick={() => submit.mutate()}>{t('submit')}</Button>
          : <Button size="md" disabled={!canNext} onClick={() => setStep(s => s + 1)}>{ta('flow.next')}</Button>}
      </>}>
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
    </FlowFrame>
  );
}
