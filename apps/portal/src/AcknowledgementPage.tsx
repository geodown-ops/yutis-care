import { Button, Card, List, Stack, Text, Textarea } from '@mantine/core';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ackFields } from './acknowledgement';
import { acknowledgementQuery, api, isApiError, tasksQuery } from './api';
import { formatDate } from './dates';
import { FlowFrame, FlowLoading, FlowMessage } from './Flow';
import { LoadError } from './Page';

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
  const [comment, setComment] = useState('');
  const confirm = useMutation({
    mutationFn: () => data(api.POST('/api/portal/acknowledgements/{id}/confirm', { params: { path: { id } }, body: comment.trim() ? { comment: comment.trim() } : {} })),
    onSuccess: row => queryClient.setQueryData(query.queryKey, row),
    // Already confirmed elsewhere (the emailed link): show it as confirmed.
    onError: err => { if (isApiError(err, 409)) void queryClient.invalidateQueries({ queryKey: query.queryKey }); },
    onSettled: () => queryClient.invalidateQueries({ queryKey: tasksQuery.queryKey }),
  });
  const title = lang === 'zh' && ack.data ? ack.data.title : t('ack.title');

  if (confirm.isSuccess) return <FlowMessage title={title} message={t('ack.done')} done />;
  if (ack.isPending) return <FlowLoading title={title} />;
  if (ack.isError) {
    return isApiError(ack.error, 404)
      ? <FlowMessage title={title} message={t('ack.notFound')} />
      : <FlowFrame title={title}><LoadError onRetry={() => void ack.refetch()} /></FlowFrame>;
  }
  if (ack.data.confirmedAt) return <FlowMessage title={title} message={t('ack.confirmedAt', { date: formatDate(ack.data.confirmedAt, lang) })} done />;

  const fields = ackFields(ack.data.content);
  return (
    <FlowFrame title={title} error={confirm.isError && !isApiError(confirm.error, 409) ? t('flow.failed') : null}
      footer={<Button size="md" loading={confirm.isPending} onClick={() => confirm.mutate()}>{t('ack.confirm')}</Button>}>
      <Text c="dimmed">{t('ack.intro')}</Text>
      <Card>
        <Stack gap="md">
          {fields.map(f => (
            <div key={f.key}>
              <Text size="sm" c="dimmed">{t(`ack.fields.${f.key}`, { defaultValue: f.key })}</Text>
              {Array.isArray(f.value)
                ? <List size="md" mt={2} spacing={2}>{f.value.map(v => <List.Item key={v}>{v}</List.Item>)}</List>
                : <Text fw={500} style={{ whiteSpace: 'pre-wrap' }}>{f.value == null ? t('ack.none') : f.date ? formatDate(f.value, lang) : f.value}</Text>}
            </div>
          ))}
        </Stack>
      </Card>
      <Text fw={600}>{t('ack.statement')}</Text>
      <Textarea label={t('ack.comment')} autosize minRows={2} maxRows={6} maxLength={1000} size="md"
        value={comment} onChange={e => setComment(e.currentTarget.value)} />
    </FlowFrame>
  );
}
