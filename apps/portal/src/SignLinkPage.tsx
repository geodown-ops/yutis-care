import { Button } from '@mantine/core';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ApiRequestError, data } from '@yutis/api-client';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AckRecord } from './AcknowledgementPage';
import { api } from './api';
import { formatDate } from './dates';
import { FlowFrame, FlowLoading, FlowMessage } from './Flow';
import { LoadError } from './Page';

/** Why a one-time link can't be used, as the ack.* message key; null when it is something to retry. */
export function linkProblem(err: unknown): 'linkUsed' | 'linkExpired' | 'linkInvalid' | null {
  if (!(err instanceof ApiRequestError)) return null;
  if (err.status === 410) return err.code === 'token_expired' ? 'linkExpired' : 'linkUsed';
  if (err.status === 404) return 'linkInvalid';
  return null;
}

/** A 附表八 sign-off ({ record, signer }) rather than a record about the employee; those are signed on the back office. */
export const isServiceSignOff = (content: Record<string, unknown>) => 'record' in content && 'signer' in content;

/**
 * An emailed confirmation link (/me/sign/{token}): opens the one record without signing in and confirms it once
 * (GET and POST /api/sign/{token}). Opening the link does not use it up; confirming does.
 */
export function SignLinkPage({ token }: { token: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [comment, setComment] = useState('');
  const doc = useQuery({
    queryKey: ['sign', token],
    queryFn: () => data(api.GET('/api/sign/{token}', { params: { path: { token } } })),
    staleTime: Infinity, refetchOnWindowFocus: false,
  });
  const confirm = useMutation({
    mutationFn: () => data(api.POST('/api/sign/{token}', { params: { path: { token } }, body: comment.trim() ? { comment: comment.trim() } : {} })),
  });
  const signOff = doc.data ? isServiceSignOff(doc.data.content) : false;
  useEffect(() => { if (signOff) window.location.replace(`/sign/${encodeURIComponent(token)}`); }, [signOff, token]);
  const title = lang === 'zh' && doc.data ? doc.data.title : t('ack.title');

  if (confirm.isSuccess) return <FlowMessage title={title} message={t('ack.done')} done exit={false} />;
  if (doc.isPending || signOff) return <FlowLoading title={title} exit={false} />;
  if (doc.isError) {
    const problem = linkProblem(doc.error);
    return problem
      ? <FlowMessage title={title} message={t(`ack.${problem}`)} exit={false} />
      : <FlowFrame title={title} exit={false}><LoadError onRetry={() => void doc.refetch()} /></FlowFrame>;
  }
  if (doc.data.confirmedAt) return <FlowMessage title={title} message={t('ack.confirmedAt', { date: formatDate(doc.data.confirmedAt, lang) })} done exit={false} />;

  const used = linkProblem(confirm.error);
  return (
    <FlowFrame title={title} exit={false} error={confirm.isError ? (used ? t(`ack.${used}`) : t('flow.failed')) : null}
      footer={<Button size="md" loading={confirm.isPending} disabled={!!used} onClick={() => confirm.mutate()}>{t('ack.confirm')}</Button>}>
      <AckRecord content={doc.data.content} comment={comment} onComment={setComment} />
    </FlowFrame>
  );
}
