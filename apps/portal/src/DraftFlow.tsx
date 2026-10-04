/*
 * A questionnaire's answers and step, restored from its draft and saved back as the person goes (drafts.ts):
 * PUT /api/portal/tasks/{kind}/{id}/draft shortly after each change, and at once when they leave the flow or switch
 * apps; DELETE …/draft to start over.
 */
import { Button, Card, Group, Stack, Text } from '@mantine/core';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useCallback, useEffect, useRef, useState, type SetStateAction } from 'react';
import { useTranslation } from 'react-i18next';
import { api, isApiError, taskQuery } from './api';
import {
  dropUnsaved, encodeDraft, keepUnsaved, restoreDraft, settleUnsaved, unsavedFor, type DraftFormat, type DraftKind,
} from './drafts';
import { ErrorNote } from './Page';
import type { TaskDetail } from './tasks';

/** Long enough to save once per answer, not once per keystroke in the hours fields. */
const SAVE_AFTER_MS = 800;

type SaveStatus = 'idle' | 'saved' | 'failed';

export function useDraftFlow<A>({ kind, id, owner, task, format }: {
  kind: DraftKind;
  id: string;
  /** The signed-in employee, so unsaved answers are only ever restored to them. */
  owner: string;
  task: TaskDetail;
  format: DraftFormat<A>;
}) {
  const queryClient = useQueryClient();
  const [start] = useState(() => restoreDraft(task.draft?.answers, unsavedFor(kind, id, owner), format));
  const [step, setStepValue] = useState(() => start?.draft.step ?? 0);
  const [answers, setAnswersValue] = useState<A>(() => start?.draft.answers ?? format.empty());
  const [resumed, setResumed] = useState(start != null);
  // Answers restored from this page's memory never reached the account, so they are saved straight away.
  const [touched, setTouched] = useState(start?.from === 'memory');
  const autosave = useAutosave(kind, id, owner, touched ? JSON.stringify(encodeDraft({ step, answers })) : null);

  const startOver = useMutation({
    mutationFn: async () => {
      autosave.pause();
      await autosave.settled();
      await data(api.DELETE('/api/portal/tasks/{kind}/{id}/draft', { params: { path: { kind, id } } }));
    },
    onSuccess: () => {
      dropUnsaved(kind, id);
      setAnswersValue(format.empty());
      setStepValue(0);
      setTouched(false);
      setResumed(false);
      queryClient.setQueryData(taskQuery(kind, id).queryKey, t => t && { ...t, draft: null });
    },
    onSettled: () => autosave.resume(),
  });

  return {
    step,
    answers,
    setStep: (next: SetStateAction<number>) => { setStepValue(next); setTouched(true); setResumed(false); },
    setAnswers: (next: SetStateAction<A>) => { setAnswersValue(next); setTouched(true); },
    /** The flow carried on from a draft: offer to start over. */
    resumed,
    startOver,
    autosave,
    /** Before sending: no draft save may race the submit. */
    beforeSubmit: () => autosave.pause(),
    /** After sending: sent (or sent already, 409) means the API has deleted the draft; otherwise keep saving it. */
    afterSubmit: (err: unknown) => {
      if (err && !isApiError(err, 409)) return autosave.resume();
      dropUnsaved(kind, id);
      void queryClient.invalidateQueries({ queryKey: taskQuery(kind, id).queryKey });
    },
  };
}

/** What the notices below need; the same whatever the questionnaire's answers are. */
type DraftFlow = Pick<ReturnType<typeof useDraftFlow<unknown>>, 'resumed' | 'startOver' | 'autosave'>;

function useAutosave(kind: DraftKind, id: string, owner: string, json: string | null) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<SaveStatus>('idle');
  // A mutation, so a lapsed session (401) is handled like every other call (main.tsx).
  const save = useMutation({
    mutationFn: (body: string) => data(api.PUT('/api/portal/tasks/{kind}/{id}/draft', {
      params: { path: { kind, id } }, body: { answers: JSON.parse(body) as Record<string, unknown> },
    })),
  });
  const mutate = useRef(save.mutateAsync);
  mutate.current = save.mutateAsync;
  const state = useRef({ json, sent: null as string | null, timer: 0, paused: false, chain: Promise.resolve() });
  state.current.json = json;

  /** Saves the latest answers now. Saves go one at a time, so an older one never lands after a newer one. */
  const flush = useCallback(() => {
    const s = state.current;
    window.clearTimeout(s.timer);
    const body = s.json;
    if (s.paused || body == null || body === s.sent) return;
    s.sent = body;
    s.chain = s.chain.then(() => (s.paused ? undefined : mutate.current(body).then(
      () => { settleUnsaved(kind, id, body); setStatus('saved'); },
      (err: unknown) => {
        if (s.sent === body) s.sent = null;
        if (isApiError(err, 409) || isApiError(err, 404)) {
          // Sent from elsewhere (a nurse filled it in with them) or gone: stop, and let the page say so.
          s.paused = true;
          void queryClient.invalidateQueries({ queryKey: taskQuery(kind, id).queryKey });
        } else if (isApiError(err, 401)) {
          // The session lapsed and sign-in is next; the answers wait in memory (keepUnsaved) until then.
          s.paused = true;
        } else {
          setStatus('failed');
        }
      },
    )));
  }, [kind, id, queryClient]);

  useEffect(() => {
    if (json == null) return;
    keepUnsaved(kind, id, owner, json);
    const s = state.current;
    window.clearTimeout(s.timer);
    s.timer = window.setTimeout(flush, SAVE_AFTER_MS);
  }, [json, kind, id, owner, flush]);

  // Leaving the questionnaire, or the phone switching to another app, saves at once.
  useEffect(() => {
    const onHide = () => { if (document.visibilityState === 'hidden') flush(); };
    document.addEventListener('visibilitychange', onHide);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      flush();
    };
  }, [flush]);

  return {
    status,
    pause: () => { state.current.paused = true; window.clearTimeout(state.current.timer); },
    resume: () => {
      const s = state.current;
      s.paused = false;
      s.sent = null;
      s.timer = window.setTimeout(flush, SAVE_AFTER_MS);
    },
    /** Resolves when the saves already sent have finished. */
    settled: () => state.current.chain,
  };
}

/** Under the progress bar: whether the answers are saved to the account. */
export function SaveNote({ flow }: { flow: DraftFlow }) {
  const { t } = useTranslation();
  const { status } = flow.autosave;
  if (status === 'failed') return <Text span size="xs" c="var(--yutis-warn)">{t('flow.saveFailed')}</Text>;
  return status === 'saved' ? t('flow.saved') : ' ';
}

/** Shown on the first screen after a draft is restored: where the answers came from, and a way to start over. */
export function ResumeNotice({ flow }: { flow: DraftFlow }) {
  const { t } = useTranslation();
  const [asking, setAsking] = useState(false);
  if (!flow.resumed) return null;
  return (
    <Card padding="sm" radius="md" bg="var(--yutis-surface2)">
      {asking ? (
        <Stack gap="xs">
          <Text size="sm">{t('flow.startOverAsk')}</Text>
          <Group gap="xs">
            <Button size="xs" color="var(--yutis-bad)" loading={flow.startOver.isPending} onClick={() => flow.startOver.mutate()}>{t('flow.startOverYes')}</Button>
            <Button size="xs" variant="default" disabled={flow.startOver.isPending} onClick={() => setAsking(false)}>{t('flow.startOverNo')}</Button>
          </Group>
          {flow.startOver.isError && <ErrorNote>{t('flow.clearFailed')}</ErrorNote>}
        </Stack>
      ) : (
        <Group justify="space-between" wrap="nowrap" gap="sm">
          <Text size="sm">{t('flow.resumed')}</Text>
          <Button size="xs" variant="default" style={{ flexShrink: 0 }} onClick={() => setAsking(true)}>{t('flow.startOver')}</Button>
        </Group>
      )}
    </Card>
  );
}
