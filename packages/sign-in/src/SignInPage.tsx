import { Anchor, Box, Button, Card, Divider, Group, PasswordInput, SimpleGrid, Stack, Text, TextInput, Title, UnstyledButton } from '@mantine/core';
import { IconMail } from '@tabler/icons-react';
import { data, type TenantApi, type TenantInfo } from '@yutis/api-client';
import { YutisMark } from '@yutis/ui';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { DEMO_EMPLOYEES, DEMO_SIGN_IN_TITLE, DEMO_STAFF, demoHomeUrl } from './demo-accounts';
import { signInProblem, type SignInProblem } from './errors';
import { completeEmailLink, isEmailLink, rememberedEmail, sendEmailLink, signInWithPassword, signInWithSso } from './identity';
import { fill, STAFF_TEXT, type SignInText } from './text';

export interface SignInPageProps {
  api: TenantApi;
  tenant: TenantInfo;
  /** Back office or employee portal; the API looks the person up in staff accounts or the employee master. */
  as: 'staff' | 'employee';
  /** This app's sign-in page as an absolute URL; email sign-in links bring people back here. */
  emailLinkUrl: string;
  /** The session cookie is set; reload `me` and go on. */
  onSignedIn: () => void;
  text?: SignInText;
  /** Top-right of the page, e.g. the portal's language select. */
  headerEnd?: ReactNode;
  /** Shown above the sign-in options, e.g. that the previous session timed out. */
  notice?: ReactNode;
}

/**
 * The tenant's sign-in page. Offers what GET /api/tenant lists: SSO providers, an emailed sign-in link and password
 * (all through Identity Platform), or dev sign-in on local machines and the demo site. Each ends in POST /api/auth/sign-in.
 */
export function SignInPage({ api, tenant, as, emailLinkUrl, onSignedIn, text = STAFF_TEXT, headerEnd, notice }: SignInPageProps) {
  const t = text;
  const cfg = tenant.identityPlatform ?? null;
  const methods = new Set(tenant.loginMethods);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<SignInProblem | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [linkHref] = useState(() => (cfg && isEmailLink(window.location.href) ? window.location.href : null));
  const [linkNeedsEmail, setLinkNeedsEmail] = useState(false);
  const linkStarted = useRef(false);

  async function run(key: string, getToken: () => Promise<string>) {
    setBusy(key);
    setProblem(null);
    try {
      const token = await getToken();
      await data(api.POST('/api/auth/sign-in', { body: { token, as } }));
      onSignedIn();
    } catch (err) {
      setProblem(signInProblem(err));
    } finally {
      setBusy(null);
    }
  }

  // Opened from an emailed link: finish signing in, asking for the address if the link was requested on another device.
  useEffect(() => {
    if (!cfg || !linkHref || linkStarted.current) return;
    linkStarted.current = true;
    const email = rememberedEmail();
    if (email) void run('link', () => completeEmailLink(cfg, email, linkHref));
    else setLinkNeedsEmail(true);
  }, []);

  const sections: ReactNode[] = [];
  const idp = cfg !== null;

  if (linkHref && idp) {
    sections.push(linkNeedsEmail
      ? <EmailForm key="link" label={t.email} hint={t.confirmEmail} action={t.signIn} busy={busy === 'link'}
          onSubmit={email => run('link', () => completeEmailLink(cfg, email, linkHref))} />
      : <Text key="link" c="dimmed">{t.completing}</Text>);
  } else {
    if (methods.has('sso') && idp && cfg.providers.length > 0) {
      sections.push(
        <Stack key="sso" gap="sm">
          {cfg.providers.map((p, i) => (
            <Button key={p.id} size="md" fullWidth variant={i === 0 ? 'filled' : 'default'} loading={busy === p.id} disabled={!!busy && busy !== p.id}
              onClick={() => void run(p.id, () => signInWithSso(cfg, p.id))}>
              {fill(t.sso, { provider: p.label })}
            </Button>
          ))}
        </Stack>,
      );
    }
    if (methods.has('email_otp') && idp) {
      sections.push(sentTo
        ? <Notice key="email" tone="info" icon={<IconMail size={18} />}>{fill(t.linkSent, { email: sentTo })}</Notice>
        : <EmailForm key="email" label={t.email} action={t.sendLink} busy={busy === 'email'} quiet={sections.length > 0}
            onSubmit={email => {
              setBusy('email');
              setProblem(null);
              sendEmailLink(api, cfg, as, email, emailLinkUrl).then(() => setSentTo(email), (err: unknown) => setProblem(signInProblem(err))).finally(() => setBusy(null));
            }} />);
    }
    if (methods.has('password') && idp) {
      sections.push(<PasswordForm key="password" t={t} busy={busy === 'password'} quiet={sections.length > 0}
        onSubmit={(email, password) => run('password', () => signInWithPassword(cfg, email, password))} />);
    }
    if (methods.has('dev')) {
      const demo = tenant.subdomain === 'demo' ? (as === 'staff' ? DEMO_STAFF : DEMO_EMPLOYEES) : [];
      sections.push(
        <Stack key="dev" gap="md">
          {demo.length > 0 && (
            <Stack gap={8}>
              <Text size="sm" fw={600}>{t.demoAccounts}</Text>
              <SimpleGrid cols={2} spacing={8}>
                {demo.map(a => (
                  <UnstyledButton key={a.token} disabled={!!busy} onClick={() => void run(a.token, () => Promise.resolve(a.token))} p="sm"
                    aria-label={`${a.label} ${a.name}`}
                    style={{ borderRadius: 'var(--mantine-radius-md)', background: 'var(--yutis-surface2)', opacity: busy && busy !== a.token ? 0.6 : 1 }}>
                    <Text size="sm" fw={600}>{a.label}</Text>
                    <Text size="xs" c="dimmed">{busy === a.token ? t.completing : a.name}</Text>
                  </UnstyledButton>
                ))}
              </SimpleGrid>
            </Stack>
          )}
          <EmailForm label={t.devLabel} hint={t.devHint} action={t.signIn} busy={busy === 'dev'} quiet={demo.length > 0} type="text"
            onSubmit={token => run('dev', () => Promise.resolve(token))} />
        </Stack>,
      );
    }
  }

  return (
    <Box mih="100dvh" bg="var(--yutis-bg)" px="md" py="xl" style={{ display: 'grid', placeItems: 'center' }}>
      <Stack w="100%" maw={420} gap="lg">
        <Group justify="space-between" wrap="nowrap">
          {tenant.subdomain === 'demo' ? (
            // The demo site's logo leads back to the marketing site.
            <Anchor href={demoHomeUrl(window.location.hostname)} aria-label="回到 Yutis Care 官網" c="inherit" underline="never" style={{ minWidth: 0 }}>
              <Group gap={10} wrap="nowrap">
                <YutisMark height={28} />
                <Text fw={700} truncate>{DEMO_SIGN_IN_TITLE}</Text>
              </Group>
            </Anchor>
          ) : (
            <Group gap={10} wrap="nowrap" style={{ minWidth: 0 }}>
              <YutisMark height={28} />
              <Text fw={700} truncate>{tenant.name}</Text>
            </Group>
          )}
          {headerEnd}
        </Group>
        <Card padding="xl">
          <Stack gap="lg">
            <div>
              <Title order={2} fz={26}>{t.title}</Title>
              <Text size="sm" c="dimmed" mt={4}>{t.subtitle}</Text>
            </div>
            {notice && !problem && <Notice tone="info">{notice}</Notice>}
            {problem && <Notice tone="bad">{t.problems[problem]}</Notice>}
            {sections.length === 0
              ? <Text c="dimmed">{t.noMethods}</Text>
              : sections.flatMap((s, i) => (i === 0 ? [s] : [<Divider key={`or${i}`} label={t.or} labelPosition="center" />, s]))}
          </Stack>
        </Card>
      </Stack>
    </Box>
  );
}

function Notice({ tone, icon, children }: { tone: 'bad' | 'info'; icon?: ReactNode; children: ReactNode }) {
  return (
    <Group role={tone === 'bad' ? 'alert' : 'status'} gap="sm" wrap="nowrap" align="flex-start" p="sm"
      style={{ borderRadius: 'var(--mantine-radius-md)', background: `var(--yutis-${tone}-weak)`, color: `var(--yutis-${tone})` }}>
      {icon}
      <Text size="sm" c="inherit">{children}</Text>
    </Group>
  );
}

function EmailForm({ label, hint, action, busy, quiet = false, type = 'email', onSubmit }: {
  label: string; hint?: string; action: string; busy: boolean; quiet?: boolean; type?: 'email' | 'text'; onSubmit: (value: string) => void;
}) {
  const [value, setValue] = useState('');
  const submit = (e: FormEvent) => { e.preventDefault(); if (value.trim()) onSubmit(value.trim()); };
  return (
    <form onSubmit={submit}>
      <Stack gap="sm">
        <TextInput label={label} description={hint} type={type} autoComplete={type === 'email' ? 'email' : 'username'} size="md" required
          value={value} onChange={e => setValue(e.currentTarget.value)} />
        <Button type="submit" size="md" fullWidth variant={quiet ? 'default' : 'filled'} loading={busy}>{action}</Button>
      </Stack>
    </form>
  );
}

function PasswordForm({ t, busy, quiet, onSubmit }: { t: SignInText; busy: boolean; quiet: boolean; onSubmit: (email: string, password: string) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  return (
    <form onSubmit={e => { e.preventDefault(); if (email && password) onSubmit(email.trim(), password); }}>
      <Stack gap="sm">
        <TextInput label={t.email} type="email" autoComplete="email" size="md" required value={email} onChange={e => setEmail(e.currentTarget.value)} />
        <PasswordInput label={t.password} autoComplete="current-password" size="md" required value={password} onChange={e => setPassword(e.currentTarget.value)} />
        <Button type="submit" size="md" fullWidth variant={quiet ? 'default' : 'filled'} loading={busy}>{t.signIn}</Button>
      </Stack>
    </form>
  );
}
