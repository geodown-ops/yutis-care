import { Button, Card, List, Stack, Text, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ackFields, type AckContent } from './acknowledgement';
import { acknowledgementQuery, api, isApiError, profileQuery, tasksQuery } from './api';
import { formatDate } from './dates';
import { FlowFrame, FlowLoading, FlowMessage } from './Flow';
import { ErrorNote, LoadError } from './Page';

/**
 * 紀錄確認: the record staff wrote with the employee (e.g. a maternal-health interview's work arrangement), shown in
 * full, then confirmed with an optional comment (POST /api/portal/acknowledgements/{id}/confirm).
 */
export function AcknowledgementPage({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const queryClient = useQueryClient();
  const query = acknowledgementQuery(id);
  const ack = useQuery(query);
  const profile = useQuery(profileQuery);
  const [comment, setComment] = useState('');
  const confirm = useMutation({
    mutationFn: () => data(api.POST('/api/portal/acknowledgements/{id}/confirm', { params: { path: { id } }, body: comment.trim() ? { comment: comment.trim() } : {} })),
    onSuccess: row => queryClient.setQueryData(query.queryKey, row),
    // Already confirmed elsewhere (the emailed link): show it as confirmed.
    onError: err => { if (isApiError(err, 409)) void queryClient.invalidateQueries({ queryKey: query.queryKey }); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey }),
  });
  // The API writes the title in the account's language; another language on this device gets the generic name.
  const title = ack.data && profile.data?.lang === lang ? ack.data.title : t('ack.title');

  if (confirm.isSuccess) return <FlowMessage title={title} message={t('ack.done')} done />;
  if (ack.isPending) return <FlowLoading title={title} />;
  if (ack.isError) {
    return isApiError(ack.error, 404)
      ? <FlowMessage title={title} message={t('ack.notFound')} />
      : <FlowFrame title={title}><LoadError onRetry={() => void ack.refetch()} /></FlowFrame>;
  }
  if (ack.data.confirmedAt) return <FlowMessage title={title} message={t('ack.confirmedAt', { date: formatDate(ack.data.confirmedAt, lang) })} done />;
  if (!ack.data.content) return <AckUnavailable title={title} />;

  return (
    <FlowFrame title={title} error={confirm.isError && !isApiError(confirm.error, 409) ? t('flow.failed') : null}
      footer={<Button size="md" loading={confirm.isPending} onClick={() => confirm.mutate()}>{t('ack.confirm')}</Button>}>
      <AckRecord content={ack.data.content} comment={comment} onComment={setComment} />
    </FlowFrame>
  );
}

/** The API could not find what the record is about: there is nothing to read, so nothing to confirm. */
export function AckUnavailable({ title, exit = true }: { title: string; exit?: boolean }) {
  const { t } = useTranslation();
  return <FlowFrame title={title} exit={exit}><ErrorNote>{t('ack.unavailable')}</ErrorNote></FlowFrame>;
}

/** The record in full, the statement the person confirms, and their optional comment. */
export function AckRecord({ content, comment, onComment }: { content: AckContent; comment: string; onComment: (v: string) => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  return (
    <>
      <Text c="dimmed">{t('ack.intro')}</Text>
      <Card>
        <Stack gap="md">
          {ackFields(content).map(f => (
            <div key={f.key}>
              <Text size="sm" c="dimmed">{t(`ack.fields.${f.key}`)}</Text>
              {Array.isArray(f.value)
                ? <List size="md" mt={2} spacing={2}>{f.value.map((v, i) => <List.Item key={i}>{v}</List.Item>)}</List>
                : <Text fw={500} style={{ whiteSpace: 'pre-wrap' }}>{f.value == null ? t('ack.none') : f.date ? formatDate(f.value, lang) : f.value}</Text>}
            </div>
          ))}
        </Stack>
      </Card>
      <Text fw={600}>{t('ack.statement')}</Text>
      <Textarea label={t('ack.comment')} autosize minRows={2} maxRows={6} maxLength={1000} size="md"
        value={comment} onChange={e => onComment(e.currentTarget.value)} />
    </>
  );
}
