import { Box, Button, Card, Center, Group, Loader, Stack, Text, Title } from '@mantine/core';
import { IconBrandGoogle } from '@tabler/icons-react';
import { signInPlatform, type PlatformAccount, type PlatformSignInConfig } from '@yutis/sign-in';
import { YutisMark } from '@yutis/ui';
import { useState, type ReactNode } from 'react';
import { googleSignInProblem } from './auth';
import { ToneAlert } from './components';

/** Platform staff sign in with their Google account (deployments without Identity-Aware Proxy). */
export function SignInPage({ cfg, onSignedIn }: { cfg: PlatformSignInConfig; onSignedIn: (a: PlatformAccount) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  async function signIn() {
    setBusy(true);
    setProblem(null);
    try {
      onSignedIn(await signInPlatform(cfg));
    } catch (err) {
      setProblem(googleSignInProblem(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <SignInFrame>
      <div>
        <Title order={2} fz={26}>登入平台管理</Title>
        <Text size="sm" c="dimmed" mt={4}>請用 Yutis 的 Google 帳號登入。只有已開通的平台人員可以使用。</Text>
      </div>
      {problem && <ToneAlert tone="bad">{problem}</ToneAlert>}
      <Button size="md" fullWidth leftSection={<IconBrandGoogle size={18} />} loading={busy} onClick={() => void signIn()}>
        使用 Google 帳號登入
      </Button>
    </SignInFrame>
  );
}

/** The sign-in page's frame, also used while the app finds out how to sign in. */
export function SignInFrame({ children }: { children?: ReactNode }) {
  return (
    <Box mih="100dvh" bg="var(--yutis-bg)" px="md" py="xl" style={{ display: 'grid', placeItems: 'center' }}>
      <Stack w="100%" maw={420} gap="lg">
        <Group gap={10} wrap="nowrap">
          <YutisMark height={28} />
          <div>
            <Text fw={700} lh={1.2}>Yutis Care</Text>
            <Text size="xs" c="dimmed">平台管理</Text>
          </div>
        </Group>
        <Card padding="xl">
          <Stack gap="lg">{children ?? <Center py="lg"><Loader size="sm" /></Center>}</Stack>
        </Card>
      </Stack>
    </Box>
  );
}
