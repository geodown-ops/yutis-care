import { Card, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';

export function SimplePage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = useTranslation();
  return (
    <Stack gap="md" p="md" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 24px)' }}>
      <Title order={3}>{t(titleKey)}</Title>
      <Card><Text c="dimmed">{t(bodyKey)}</Text></Card>
    </Stack>
  );
}
