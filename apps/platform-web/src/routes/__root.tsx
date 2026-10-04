import { Button, Text } from '@mantine/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation, useRouter } from '@tanstack/react-router';
import { platformIdToken, signOutPlatform, type PlatformSignInConfig } from '@yutis/sign-in';
import { ConsoleShell, NavSection, SidebarIcon, sidebarLinkStyles } from '@yutis/ui';
import { useCallback, useEffect, useMemo } from 'react';
import { sendIdTokens } from '../api';
import { accountQuery, googleSignIn, onUnauthorized, signInConfigQuery } from '../auth';
import { menuLink, NavLinkRouter } from '../links';
import { isActivePath, NAV } from '../nav';
import { SignInFrame, SignInPage } from '../SignInPage';

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: PlatformRoot });

/** First how this deployment identifies staff; with Google sign-in, nothing but the sign-in page until signed in. */
function PlatformRoot() {
  const config = useQuery(signInConfigQuery);
  const google = useMemo(() => (config.data ? googleSignIn(config.data) : null), [config.data]);
  if (config.isPending) return <SignInFrame />;
  if (config.isError) {
    return (
      <SignInFrame>
        <Text>無法連線到平台 API，請檢查網路後再試一次。</Text>
        <Button variant="default" onClick={() => void config.refetch()}>重試</Button>
      </SignInFrame>
    );
  }
  // The platform API has no "who am I" endpoint yet, so behind IAP the header cannot name the person or their role.
  return google ? <GoogleSignedIn cfg={google} /> : <PlatformLayout user={{ name: '平台人員', role: 'Yutis 內部' }} />;
}

function GoogleSignedIn({ cfg }: { cfg: PlatformSignInConfig }) {
  const qc = useQueryClient();
  const query = accountQuery(cfg);
  const account = useQuery(query);
  const signOut = useCallback(async () => {
    await signOutPlatform(cfg);
    qc.removeQueries({ predicate: q => q.queryKey[0] !== 'sign-in-config' });
    qc.setQueryData(accountQuery(cfg).queryKey, null);
  }, [cfg, qc]);
  // Pages render only once someone is signed in, which is after this has run.
  useEffect(() => {
    sendIdTokens(() => platformIdToken(cfg));
    // A refused token (expired, revoked): back to the sign-in page.
    onUnauthorized(() => void signOut());
    return () => { sendIdTokens(null); onUnauthorized(null); };
  }, [cfg, signOut]);
  if (account.isPending) return <SignInFrame />;
  if (!account.data) return <SignInPage cfg={cfg} onSignedIn={a => qc.setQueryData(query.queryKey, a)} />;
  const { name, email } = account.data;
  return <PlatformLayout user={{ name: name ?? email ?? '平台人員', role: email ?? 'Yutis 內部' }} onSignOut={() => void signOut()} />;
}

function PlatformLayout({ user, onSignOut }: { user: { name: string; role: string }; onSignOut?: () => void }) {
  const { pathname } = useLocation();
  const { routesByPath } = useRouter();
  return (
    <ConsoleShell
      title="Yutis Care"
      subtitle="平台管理"
      user={user}
      onSignOut={onSignOut}
      nav={close => NAV.map(g => (
        <NavSection key={g.label} label={g.label}>
          {g.items.map(it => {
            const active = isActivePath(it.path, pathname);
            return <NavLinkRouter key={it.path} {...menuLink(it.path, routesByPath)} label={it.label} leftSection={<SidebarIcon icon={it.icon} active={active} />} active={active} onClick={close} aria-current={active ? 'page' : undefined} styles={sidebarLinkStyles(active)} />;
          })}
        </NavSection>
      ))}
    >
      <Outlet />
    </ConsoleShell>
  );
}
