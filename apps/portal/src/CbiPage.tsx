import { Button, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useTranslation } from 'react-i18next';
import { api, healthQuery, tasksQuery } from './api';
import { ResumeNotice, SaveNote, useDraftFlow } from './DraftFlow';
import { ChoiceList, FlowFrame, FlowMessage, submitProblem, TaskGate } from './Flow';
import type { TaskDetail } from './tasks';
import { CBI_DRAFT, CBI_STEPS, cbiBody, cbiComplete } from './workload-flow';

/**
 * 過勞量表 (Copenhagen Burnout Inventory), one question per screen: 6 personal items, then 7 work items. Answers are
 * option indexes 0–4, saved as a draft as the person goes and sent together at the end
 * (PUT /api/portal/workload/{id}/cbi); the API scores them.
 */
export function CbiPage({ id, owner }: { id: string; owner: string }) {
  const { t } = useTranslation('workload');
  return (
    <TaskGate kind="cbi" id={id} title={t('cbi.title')} sentMessage={t('done')}>
      {(task, onSent) => <CbiFlow id={id} owner={owner} task={task} onSent={onSent} />}
    </TaskGate>
  );
}

function CbiFlow({ id, owner, task, onSent }: { id: string; owner: string; task: TaskDetail; onSent: () => void }) {
  const { t } = useTranslation('workload');
  const { t: ta } = useTranslation('app');
  const queryClient = useQueryClient();
  const flow = useDraftFlow({ kind: 'cbi', id, owner, task, format: CBI_DRAFT });
  const { step, setStep, answers: a, setAnswers: setA } = flow;
  const submit = useMutation({
    mutationFn: () => data(api.PUT('/api/portal/workload/{id}/cbi', { params: { path: { id } }, body: cbiBody(a) })),
    onMutate: flow.beforeSubmit,
    onSettled: (_, err) => {
      flow.afterSubmit(err);
      return queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey });
    },
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: healthQuery.queryKey }); onSent(); },
  });
  const title = t('cbi.title');
  const total = CBI_STEPS.length;
  const s = CBI_STEPS[step]!;
  const value = a[s.part][s.index] ?? null;
  const last = step === total - 1;

  if (submit.isError && submitProblem(submit.error) === 'already') return <FlowMessage title={title} message={ta('flow.already')} />;

  const question = (t(`cbi.${s.part}`, { returnObjects: true }) as string[])[s.index] ?? '';
  const choose = (i: number) => setA(prev => ({ ...prev, [s.part]: prev[s.part].map((v, j) => (j === s.index ? i : v)) }));

  return (
    <FlowFrame title={title} step={step} total={total} status={<SaveNote flow={flow} />} error={submit.isError ? ta('flow.failed') : null}
      footer={<>
        <Button variant="default" size="md" disabled={step === 0 || submit.isPending} onClick={() => setStep(n => n - 1)}>{ta('flow.prev')}</Button>
        {last
          ? <Button size="md" disabled={!cbiComplete(a)} loading={submit.isPending} onClick={() => submit.mutate()}>{t('submit')}</Button>
          : <Button size="md" disabled={value == null} onClick={() => setStep(n => n + 1)}>{ta('flow.next')}</Button>}
      </>}>
      <ResumeNotice flow={flow} />
      <Text size="sm" c="dimmed">{t(s.part === 'p' ? 'cbi.personal' : 'cbi.work')}</Text>
      <Text fz={22} fw={700} lh={1.35}>{question}</Text>
      <ChoiceList key={step} label={question} options={t(`cbi.${s.scale}`, { returnObjects: true }) as string[]} value={value} onChange={choose} />
    </FlowFrame>
  );
}
