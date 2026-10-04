import { Button, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api, healthQuery, tasksQuery } from './api';
import { ChoiceList, FlowFrame, FlowMessage, submitProblem, taskGate, useOpenTask } from './Flow';
import { CBI_STEPS, cbiBody, cbiComplete, emptyCbi, type CbiAnswers } from './workload-flow';

/**
 * 過勞量表 (Copenhagen Burnout Inventory), one question per screen: 6 personal items, then 7 work items. Answers are
 * option indexes 0–4, sent together at the end (PUT /api/portal/workload/{id}/cbi); the API scores them.
 */
export function CbiPage({ id }: { id: string }) {
  const { t } = useTranslation('workload');
  const { t: ta } = useTranslation('app');
  const queryClient = useQueryClient();
  const open = useOpenTask('cbi', id);
  const [step, setStep] = useState(0);
  const [a, setA] = useState<CbiAnswers>(emptyCbi);
  const submit = useMutation({
    mutationFn: () => data(api.PUT('/api/portal/workload/{id}/cbi', { params: { path: { id } }, body: cbiBody(a) })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: healthQuery.queryKey }),
  });
  const title = t('cbi.title');
  const total = CBI_STEPS.length;
  const s = CBI_STEPS[step]!;
  const value = a[s.part][s.index] ?? null;
  const last = step === total - 1;

  if (submit.isSuccess) return <FlowMessage title={title} message={t('done')} done />;
  if (submit.isError && submitProblem(submit.error) === 'already') return <FlowMessage title={title} message={ta('flow.already')} />;
  const gate = taskGate(open, title, ta('flow.missing'));
  if (gate) return gate;

  const question = (t(`cbi.${s.part}`, { returnObjects: true }) as string[])[s.index] ?? '';
  const choose = (i: number) => setA(prev => ({ ...prev, [s.part]: prev[s.part].map((v, j) => (j === s.index ? i : v)) }));

  return (
    <FlowFrame title={title} step={step} total={total} error={submit.isError ? ta('flow.failed') : null}
      footer={<>
        <Button variant="default" size="md" disabled={step === 0 || submit.isPending} onClick={() => setStep(n => n - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!cbiComplete(a)} loading={submit.isPending} onClick={() => submit.mutate()}>{t('submit')}</Button>
          : <Button size="md" disabled={value == null} onClick={() => setStep(n => n + 1)}>{ta('flow.next')}</Button>}
      </>}>
      <Text size="sm" c="dimmed">{t(s.part === 'p' ? 'cbi.personal' : 'cbi.work')}</Text>
      <Text fz={22} fw={700} lh={1.35}>{question}</Text>
      <ChoiceList key={step} label={question} options={t(`cbi.${s.scale}`, { returnObjects: true }) as string[]} value={value} onChange={choose} />
    </FlowFrame>
  );
}
