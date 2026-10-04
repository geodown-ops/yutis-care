import { ActionIcon, Box, Button, CopyButton, Group, Stack, Text, TextInput, Tooltip } from '@mantine/core';
import { IconCheck, IconCopy } from '@tabler/icons-react';
import { useMutation } from '@tanstack/react-query';
import { data } from '@yutis/api-client';
import { api } from '../../api';
import { saveProblem } from '../programs/maternalViolenceCommon';

/**
 * 員工確認連結 for a record the employee must confirm (POST /api/programs/acknowledgements/{id}/link). The link is
 * shown once and never stored; issuing a new one voids the old one. Clinical staff only.
 */
export function ConfirmLinkPanel({ acknowledgementId, sent }: { acknowledgementId: string; sent?: boolean }) {
  const link = useMutation({ mutationFn: () => data(api.POST('/api/programs/acknowledgements/{id}/link', { params: { path: { id: acknowledgementId } } })) });
  return (
    <Box p="md" style={{ background: 'var(--yutis-surface2)', borderRadius: 'var(--mantine-radius-md)' }}>
      <Stack gap="xs">
        <Text fw={600}>員工確認</Text>
        <Text size="sm" c="dimmed">
          產生一次性連結請員工確認面談紀錄與工作安排，14 天內有效。員工主檔有 Email 時會同時寄出通知信（信中不含健康內容）。
          {sent && ' 重新產生會讓先前的連結失效。'}
        </Text>
        {link.data ? (
          <>
            <Group gap="xs" wrap="nowrap">
              <TextInput readOnly value={link.data.url} aria-label="員工確認連結" style={{ flex: 1, minWidth: 0 }} onFocus={e => e.currentTarget.select()} />
              <CopyButton value={link.data.url}>
                {({ copied, copy }) => (
                  <Tooltip label={copied ? '已複製' : '複製連結'}>
                    <ActionIcon variant="default" size="lg" onClick={copy} aria-label="複製連結">{copied ? <IconCheck size={16} /> : <IconCopy size={16} />}</ActionIcon>
                  </Tooltip>
                )}
              </CopyButton>
            </Group>
            <Text size="xs" c="dimmed">連結只顯示這一次，有效至 {new Date(link.data.expiresAt).toLocaleString('zh-TW', { dateStyle: 'medium', timeStyle: 'short' })}。</Text>
          </>
        ) : (
          <Group>
            <Button size="xs" loading={link.isPending} onClick={() => link.mutate()}>{sent ? '重新產生確認連結' : '產生確認連結'}</Button>
          </Group>
        )}
        {link.isError && <Text size="sm" c="var(--yutis-bad)">{saveProblem(link.error)}</Text>}
      </Stack>
    </Box>
  );
}
