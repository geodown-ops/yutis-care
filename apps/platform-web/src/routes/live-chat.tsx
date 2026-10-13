import { ActionIcon, Anchor, Badge, Box, Button, Card, Grid, Group, Indicator, ScrollArea, SegmentedControl, Stack, Text, Textarea, TextInput, Title, Tooltip, UnstyledButton } from '@mantine/core';
import { IconSearch, IconSend } from '@tabler/icons-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { data } from '@yutis/api-client';
import { useEffect, useRef, useState } from 'react';
import { api, chatConversationQuery, chatConversationsQuery, type ChatConversation, type ChatConversationDetail, type ChatMessage } from '../api';
import { lastLine, visibleConversations, visitorLabel, type ChatFilter } from '../chat';
import { ErrorAlert, Footnote, LabelBadge, LoadError, PageLoader } from '../components';
import { formatDateTime } from '../format';
import { CHAT_STATUS } from '../labels';

export const Route = createFileRoute('/live-chat')({
  component: LiveChatPage,
  validateSearch: (search: Record<string, unknown>): { c?: string } => (typeof search.c === 'string' ? { c: search.c } : {}),
});

function LiveChatPage() {
  const { c: selected } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const { data: conversations, error, refetch } = useQuery(chatConversationsQuery);
  const [filter, setFilter] = useState<ChatFilter>('open');
  const [query, setQuery] = useState('');
  const shown = conversations ? visibleConversations(conversations, filter, query) : undefined;
  const openCount = conversations?.filter(c => c.status === 'open').length ?? 0;
  const select = (id: string) => void navigate({ search: { c: id }, replace: true });

  return (
    <Stack gap="lg">
      <Title order={2}>線上客服</Title>
      <Text size="sm" c="dimmed">官網 care.yutis.net 右下角的線上客服。訪客不需登入；回覆會以「Yutis Care 客服」的名義顯示給訪客。</Text>
      {error ? <LoadError error={error} onRetry={() => void refetch()} /> : !conversations ? <PageLoader /> : (
        <Grid align="flex-start">
          <Grid.Col span={{ base: 12, md: 5, lg: 4 }}>
          <Card p="sm">
            <Stack gap="sm">
              <SegmentedControl fullWidth value={filter} onChange={v => setFilter(v as ChatFilter)} data={[
                { value: 'open', label: openCount ? `進行中（${openCount}）` : '進行中' },
                { value: 'closed', label: '已結束' },
                { value: 'all', label: '全部' },
              ]} />
              <TextInput aria-label="搜尋對話" placeholder="搜尋姓名、公司、Email 或訊息" leftSection={<IconSearch size={16} />}
                value={query} onChange={e => setQuery(e.currentTarget.value)} />
              {shown && shown.length > 0 ? (
                <Stack gap={4} component="ul" style={{ listStyle: 'none', margin: 0, padding: 0 }} aria-label="對話列表">
                  {shown.map(c => <ConversationRow key={c.id} conversation={c} active={c.id === selected} onSelect={() => select(c.id)} />)}
                </Stack>
              ) : (
                <Text c="dimmed" ta="center" py="lg" size="sm">{conversations.length === 0 ? '還沒有任何對話。' : '沒有符合條件的對話。'}</Text>
              )}
            </Stack>
          </Card>
          </Grid.Col>
          <Grid.Col span={{ base: 12, md: 7, lg: 8 }}>
            {selected ? <ConversationPanel key={selected} id={selected} /> : (
              <Card><Text c="dimmed" ta="center" py={60}>從左邊選一段對話來查看與回覆。</Text></Card>
            )}
          </Grid.Col>
        </Grid>
      )}
      <Footnote>訪客離開官網且留了 Email 時，回覆也會寄到訪客信箱；新對話會寄通知給營運信箱。對話自最後一則訊息起保存一年後刪除，不應包含任何員工健康資料。</Footnote>
    </Stack>
  );
}

function ConversationRow({ conversation: c, active, onSelect }: { conversation: ChatConversation; active: boolean; onSelect: () => void }) {
  return (
    <li>
      <UnstyledButton onClick={onSelect} aria-current={active ? 'true' : undefined} w="100%" p="sm"
        style={{ borderRadius: 'var(--mantine-radius-md)', background: active ? 'var(--mantine-color-default-hover)' : undefined }}>
        <Group justify="space-between" wrap="nowrap" gap="xs" align="flex-start">
          <Box miw={0}>
            <Group gap={6} wrap="nowrap">
              <Indicator disabled={!c.visitorOnline} color="teal" size={8} offset={-2} position="middle-start" processing>
                <Text fw={c.unread ? 700 : 600} size="sm" truncate pl={c.visitorOnline ? 10 : 0}>{visitorLabel(c)}</Text>
              </Indicator>
            </Group>
            <Text size="xs" c="dimmed" lineClamp={1}>{lastLine(c)}</Text>
          </Box>
          <Stack gap={4} align="flex-end" style={{ flex: 'none' }}>
            <Text size="xs" c="dimmed">{formatDateTime(c.lastMessageAt)}</Text>
            {c.unread > 0 ? <Badge size="sm" color="red" circle={c.unread < 10}>{c.unread}</Badge>
              : c.status === 'closed' && <LabelBadge value={CHAT_STATUS.closed} />}
          </Stack>
        </Group>
      </UnstyledButton>
    </li>
  );
}

function ConversationPanel({ id }: { id: string }) {
  const qc = useQueryClient();
  const { data: conversation, error, refetch } = useQuery(chatConversationQuery(id));
  const [draft, setDraft] = useState('');
  const viewport = useRef<HTMLDivElement>(null);
  const count = conversation?.messages.length ?? 0;

  // Opening marks the visitor's messages read, which the list's badges should show at once.
  useEffect(() => { void qc.invalidateQueries({ queryKey: ['chat-conversations'], exact: true }); }, [qc, id, count]);
  useEffect(() => { viewport.current?.scrollTo({ top: viewport.current.scrollHeight }); }, [count]);

  const done = (detail: ChatConversationDetail) => {
    qc.setQueryData(chatConversationQuery(id).queryKey, detail);
    void qc.invalidateQueries({ queryKey: ['chat-conversations'], exact: true });
  };
  const reply = useMutation({
    mutationFn: (body: string) => data(api.POST('/platform-api/chat/conversations/{id}/messages', { params: { path: { id } }, body: { body } })),
    onSuccess: detail => { setDraft(''); done(detail); },
  });
  const toggle = useMutation({
    mutationFn: (action: 'close' | 'reopen') => action === 'close'
      ? data(api.POST('/platform-api/chat/conversations/{id}/close', { params: { path: { id } } }))
      : data(api.POST('/platform-api/chat/conversations/{id}/reopen', { params: { path: { id } } })),
    onSuccess: done,
  });

  if (error) return <LoadError error={error} onRetry={() => void refetch()} />;
  if (!conversation) return <Card><PageLoader /></Card>;
  const send = () => { if (draft.trim() && !reply.isPending) reply.mutate(draft.trim()); };

  return (
    <Card p={0}>
      <Group justify="space-between" p="md" wrap="wrap" gap="sm" style={{ borderBottom: '1px solid var(--mantine-color-default-border)' }}>
        <Box miw={0}>
          <Group gap="xs">
            <Text fw={700}>{visitorLabel(conversation)}</Text>
            <LabelBadge value={CHAT_STATUS[conversation.status]} />
            {conversation.visitorOnline && <Badge color="teal" variant="light" size="sm">在線上</Badge>}
          </Group>
          <Text size="xs" c="dimmed">
            {conversation.visitorEmail ? <Anchor href={`mailto:${conversation.visitorEmail}`} size="xs">{conversation.visitorEmail}</Anchor> : '未留 Email'}
            {' · '}{formatDateTime(conversation.createdAt)} 從 {conversation.page ?? '官網'} 開始
          </Text>
        </Box>
        {conversation.status === 'open'
          ? <Button size="xs" variant="default" loading={toggle.isPending} onClick={() => toggle.mutate('close')}>結束對話</Button>
          : <Button size="xs" variant="default" loading={toggle.isPending} onClick={() => toggle.mutate('reopen')}>重新開啟</Button>}
      </Group>
      <ScrollArea h={460} viewportRef={viewport} bg="var(--mantine-color-default-hover)">
        <Stack gap="sm" p="md">
          {conversation.messages.map(m => <MessageBubble key={m.id} message={m} />)}
        </Stack>
      </ScrollArea>
      <Box p="md" style={{ borderTop: '1px solid var(--mantine-color-default-border)' }}>
        {(reply.error || toggle.error) && <Box mb="sm"><ErrorAlert error={reply.error ?? toggle.error} /></Box>}
        <Group align="flex-end" gap="sm" wrap="nowrap">
          <Textarea aria-label="回覆訪客" placeholder={conversation.status === 'closed' ? '回覆會重新開啟這段對話' : '輸入回覆，Enter 送出，Shift+Enter 換行'}
            autosize minRows={1} maxRows={6} maxLength={2000} style={{ flex: 1 }} value={draft} onChange={e => setDraft(e.currentTarget.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); send(); } }} />
          <Tooltip label="送出">
            <ActionIcon size={36} radius="xl" aria-label="送出回覆" loading={reply.isPending} disabled={!draft.trim()} onClick={send}>
              <IconSend size={18} />
            </ActionIcon>
          </Tooltip>
        </Group>
      </Box>
    </Card>
  );
}

function MessageBubble({ message: m }: { message: ChatMessage }) {
  if (m.author === 'system') return <Text size="xs" c="dimmed" ta="center">{m.body} · {formatDateTime(m.createdAt)}</Text>;
  const staff = m.author === 'staff';
  return (
    <Stack gap={2} align={staff ? 'flex-end' : 'flex-start'}>
      <Box maw="80%" px="md" py={8} style={{
        whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', borderRadius: 16,
        background: staff ? 'var(--mantine-primary-color-filled)' : 'var(--mantine-color-body)',
        color: staff ? 'var(--mantine-primary-color-contrast)' : undefined,
        border: staff ? undefined : '1px solid var(--mantine-color-default-border)',
      }}>
        <Text size="sm" inherit>{m.body}</Text>
      </Box>
      <Text size="xs" c="dimmed">{staff ? m.staffName ?? '客服' : '訪客'} · {formatDateTime(m.createdAt)}</Text>
    </Stack>
  );
}
