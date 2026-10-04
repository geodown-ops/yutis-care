import { Button, Checkbox, Group, NumberInput, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { WORK_PATTERNS } from '@yutis/domain';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, healthQuery, tasksQuery } from './api';
import { FlowFrame, FlowMessage, submitProblem, taskGate, useOpenTask } from './Flow';
import { emptyOverload, MAX_MONTH_HOURS, overloadBody, overloadComplete, validHours, type OverloadAnswers, type WorkPattern } from './workload-flow';

const HOURS = ['overtime1m', 'overtime6mAvg'] as const;

/**
 * 工時與工作型態: overtime last month, the 2–6 month average, then the work patterns that apply (none is a valid
 * answer). Sent together at the end (PUT /api/portal/workload/{id}/overload).
 */
export function OverloadPage({ id }: { id: string }) {
  const { t } = useTranslation('workload');
  const { t: ta } = useTranslation('app');
  const queryClient = useQueryClient();
  const open = useOpenTask('overload', id);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<OverloadAnswers>(emptyOverload);
  const submit = useMutation({
    mutationFn: () => data(api.PUT('/api/portal/workload/{id}/overload', { params: { path: { id } }, body: overloadBody(a) })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthQuery.queryKey }),
  });
  const title = t('overload.title');
  const total = HOURS.length + 1;
  const last = step === total - 1;
  const field = HOURS[step];

  if (submit.isSuccess) return <FlowMessage title={title} message={t('done')} done />;
  if (submit.isError && submitProblem(submit.error) === 'already') return <FlowMessage title={title} message={ta('flow.already')} />;
  const gate = taskGate(open, title, ta('flow.missing'));
  if (gate) return gate;

  const value = field ? a[field] : null;
  const filled = value !== null && value !== '';
  const labels = t('overload.patterns', { returnObjects: true }) as string[];

  return (
    <FlowFrame title={title} step={step} total={total} error={submit.isError ? ta('flow.failed') : null}
      footer={<>
        <Button variant="default" size="md" disabled={step === 0 || submit.isPending} onClick={() => setStep(n => n - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!overloadComplete(a)} loading={submit.isPending} onClick={() => submit.mutate()}>{t('submit')}</Button>
          : <Button size="md" disabled={!validHours(value)} onClick={() => setStep(n => n + 1)}>{ta('flow.next')}</Button>}
      </>}>
      {field ? (
        <>
          <Text fz={22} fw={700} lh={1.35} component="label" htmlFor="hours">{t(field === 'overtime1m' ? 'overload.m1' : 'overload.avg6')}</Text>
          <NumberInput key={field} id="hours" size="lg" min={0} max={MAX_MONTH_HOURS} clampBehavior="strict" allowNegative={false} decimalScale={1}
            value={value ?? ''} onChange={v => setA(s => ({ ...s, [field]: v }))} rightSection={<Text c="dimmed" pr="md">{t('overload.hours')}</Text>}
            rightSectionWidth="auto" error={filled && !validHours(value) ? t('overload.invalid') : undefined} />
          <Text size="sm" c="dimmed">{t('overload.hint')}</Text>
        </>
      ) : (
        <Checkbox.Group value={a.workPatterns} onChange={v => setA(s => ({ ...s, workPatterns: v as WorkPattern[] }))}
          label={<Text fz={22} fw={700} lh={1.35} mb={4}>{t('overload.patternsTitle')}</Text>} description={t('overload.patternsHint')}>
          <Stack gap={8} mt="sm">
            {WORK_PATTERNS.map((p, i) => (
              <Checkbox.Card key={p} value={p} radius="md" p="md" style={{ borderColor: 'var(--yutis-line)' }}>
                <Group wrap="nowrap" align="flex-start" gap="sm">
                  <Checkbox.Indicator />
                  <Text lh={1.4}>{labels[i] ?? p}</Text>
                </Group>
              </Checkbox.Card>
            ))}
          </Stack>
        </Checkbox.Group>
      )}
    </FlowFrame>
  );
}
