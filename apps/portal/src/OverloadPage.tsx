import { Button, Checkbox, Group, NumberInput, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { WORK_PATTERNS } from '@yutis/domain';
import { useTranslation } from 'react-i18next';
import { api, healthQuery, tasksQuery } from './api';
import { ResumeNotice, SaveNote, useDraftFlow } from './DraftFlow';
import { FlowFrame, FlowMessage, submitProblem, TaskGate } from './Flow';
import type { TaskDetail } from './tasks';
import { MAX_MONTH_HOURS, OVERLOAD_DRAFT, OVERLOAD_STEPS, overloadBody, overloadComplete, validHours, type WorkPattern } from './workload-flow';

const HOURS = ['overtime1m', 'overtime6mAvg'] as const;

/**
 * 工時與工作型態: overtime last month, the 2–6 month average, then the work patterns that apply (none is a valid
 * answer). Saved as a draft as the person goes, sent together at the end (PUT /api/portal/workload/{id}/overload).
 */
export function OverloadPage({ id, owner }: { id: string; owner: string }) {
  const { t } = useTranslation('workload');
  return (
    <TaskGate kind="overload" id={id} title={t('overload.title')} sentMessage={t('done')}>
      {(task, onSent) => <OverloadFlow id={id} owner={owner} task={task} onSent={onSent} />}
    </TaskGate>
  );
}

function OverloadFlow({ id, owner, task, onSent }: { id: string; owner: string; task: TaskDetail; onSent: () => void }) {
  const { t } = useTranslation('workload');
  const { t: ta } = useTranslation('app');
  const queryClient = useQueryClient();
  const flow = useDraftFlow({ kind: 'overload', id, owner, task, format: OVERLOAD_DRAFT });
  const { step, setStep, answers: a, setAnswers: setA } = flow;
  const submit = useMutation({
    mutationFn: () => data(api.PUT('/api/portal/workload/{id}/overload', { params: { path: { id } }, body: overloadBody(a) })),
    onMutate: flow.beforeSubmit,
    onSettled: (_, err) => {
      flow.afterSubmit(err);
      return queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: healthQuery.queryKey }); onSent(); },
  });
  const title = t('overload.title');
  const total = OVERLOAD_STEPS;
  const last = step === total - 1;
  const field = HOURS[step];

  if (submit.isError && submitProblem(submit.error) === 'already') return <FlowMessage title={title} message={ta('flow.already')} />;

  const value = field ? a[field] : null;
  const filled = value !== null && value !== '';
  const labels = t('overload.patterns', { returnObjects: true }) as string[];

  return (
    <FlowFrame title={title} step={step} total={total} status={<SaveNote flow={flow} />} error={submit.isError ? ta('flow.failed') : null}
      footer={<>
        <Button variant="default" size="md" disabled={step === 0 || submit.isPending} onClick={() => setStep(n => n - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!overloadComplete(a)} loading={submit.isPending} onClick={() => submit.mutate()}>{t('submit')}</Button>
          : <Button size="md" disabled={!validHours(value)} onClick={() => setStep(n => n + 1)}>{ta('flow.next')}</Button>}
      </>}>
      <ResumeNotice flow={flow} />
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
