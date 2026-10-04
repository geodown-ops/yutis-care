import { Card, Text } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Page } from './Page';

export function SimplePage({ titleKey, bodyKey }: { titleKey: string; bodyKey: string }) {
  const { t } = useTranslation();
  return (
    <Page title={t(titleKey)}>
      <Card><Text c="dimmed">{t(bodyKey)}</Text></Card>
    </Page>
  );
}
