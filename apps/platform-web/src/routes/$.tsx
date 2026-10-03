import { Card, Stack, Text, Title } from '@mantine/core';
import { createFileRoute } from '@tanstack/react-router';
import { ALL_NAV_ITEMS } from '../nav';

export const Route = createFileRoute('/$')({
  component: function CatchAll() {
    const { _splat = '' } = Route.useParams();
    const item = ALL_NAV_ITEMS.find(i => i.path === `/${_splat}`);
    return (
      <Stack gap="lg" maw={640}>
        <Title order={2}>{item?.label ?? '找不到這個頁面'}</Title>
        <Card><Text c="dimmed">{item ? '這個畫面會在平台 API 完成後製作。' : '網址可能打錯了，或這個頁面已經移動。'}</Text></Card>
      </Stack>
    );
  },
});
