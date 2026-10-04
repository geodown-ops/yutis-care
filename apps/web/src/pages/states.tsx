import { Button, Card, Center, Loader, Stack, Text, Title } from '@mantine/core';
import { ApiRequestError } from '@yutis/api-client';
import { ButtonLink } from '../links';

/** Plain-language text for an API error; the API's own `message` is for developers only. */
export function problemText(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'outside_sites') return '這位員工不在你負責的廠區。需要時請向租戶管理員申請破窗存取。';
    if (err.status === 403) return '你的角色沒有這個頁面的權限。';
    if (err.status === 404) return '找不到這筆資料，可能已被刪除或網址有誤。';
    if (err.status === 503) return '這項服務暫時無法使用，請稍後再試。';
  }
  return '暫時無法載入，請檢查網路後重新整理。';
}

export function PageLoader() {
  return <Center py={80}><Loader color="yutis.4" aria-label="載入中" /></Center>;
}

export function PageError({ error, reset }: { error: unknown; reset?: () => void }) {
  return (
    <Stack gap="lg" maw={640}>
      <Title order={2}>無法顯示這個頁面</Title>
      <Card>
        <Stack gap="sm" align="flex-start">
          <Text>{problemText(error)}</Text>
          {reset ? <Button variant="default" onClick={reset}>重試</Button> : <ButtonLink to="/" variant="default">回首頁</ButtonLink>}
        </Stack>
      </Card>
    </Stack>
  );
}

/** Inline empty or error state inside a card. */
export function CardNote({ children }: { children: React.ReactNode }) {
  return <Text c="dimmed" size="sm" ta="center" py="md">{children}</Text>;
}
