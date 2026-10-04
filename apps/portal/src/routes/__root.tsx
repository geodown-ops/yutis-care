import { Button, Card, Stack, Text } from '@mantine/core';
import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';

/** /login stands alone; everything else sits in the _employee layout, which requires an employee session. */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet, errorComponent: RootError });

/** Only for what no page handles itself, e.g. GET /api/tenant failing before the sign-in page can show. */
function RootError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <Stack maw={480} mx="auto" p="md" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 48px)' }}>
      <Card role="alert">
        <Text>{t('errors.load')}</Text>
        <Button mt="md" variant="default" onClick={() => { reset(); window.location.reload(); }}>{t('errors.retry')}</Button>
      </Card>
    </Stack>
  );
}
