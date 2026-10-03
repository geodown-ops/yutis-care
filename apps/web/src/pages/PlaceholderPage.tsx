import { Card, Stack, Text, Title } from '@mantine/core';
import { ButtonLink } from '../links';

export function PlaceholderPage({ title, missing = false }: { title: string; missing?: boolean }) {
  return (
    <Stack gap="lg" maw={640}>
      <Title order={2}>{title}</Title>
      <Card>
        <Stack gap="sm" align="flex-start">
          <Text c="dimmed">{missing ? '網址可能打錯了，或這個頁面已經移動。' : '這個畫面還在製作中，內容會沿用雛形的功能，接上 API 後逐頁完成。'}</Text>
          <ButtonLink to="/" variant="light">回首頁</ButtonLink>
        </Stack>
      </Card>
    </Stack>
  );
}
