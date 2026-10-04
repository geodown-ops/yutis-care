import { Button, Group, Text } from '@mantine/core';
import { useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet, useLocation, useRouter } from '@tanstack/react-router';
import { platformIdToken, signOutPlatform, type PlatformSignInConfig } from '@yutis/sign-in';
import { ConsoleShell, NavSection, SidebarIcon, sidebarLinkStyles } from '@yutis/ui';
import { useCallback, useEffect, useMemo } from 'react';
import { meQuery, sendIdTokens, type PlatformMe } from '../api';
import { accountQuery, googleSignIn, onUnauthorized, signInConfigQuery } from '../auth';
import { errorMessage } from '../errors';
import { menuLink, NavLinkRouter } from '../links';
import { isActivePath, NAV } from '../nav';
import { MeContext, visibleNav } from '../permissions';
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
  return google ? <GoogleSignedIn cfg={google} /> : <SignedIn />;
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
  return <SignedIn onSignOut={() => void signOut()} />;
}

/**
 * Who is signed in (GET /platform-api/me), before any page: the header names them as the platform knows them (not by
 * their Google account), and pages hide what their role cannot do. A Google account that is not platform staff can
 * sign out and try another.
 */
function SignedIn({ onSignOut }: { onSignOut?: () => void }) {
  const me = useQuery(meQuery);
  if (me.isPending) return <SignInFrame />;
  if (me.isError) {
    return (
      <SignInFrame>
        <Text>{errorMessage(me.error)}</Text>
        <Group gap="sm">
          <Button variant="default" onClick={() => void me.refetch()}>重試</Button>
          {onSignOut && <Button variant="default" onClick={onSignOut}>改用其他帳號登入</Button>}
        </Group>
      </SignInFrame>
    );
  }
  return (
    <MeContext.Provider value={me.data}>
      <PlatformLayout me={me.data} onSignOut={onSignOut} />
    </MeContext.Provider>
  );
}

function PlatformLayout({ me, onSignOut }: { me: PlatformMe; onSignOut?: () => void }) {
  const { pathname } = useLocation();
  const { routesByPath } = useRouter();
  return (
    <ConsoleShell
      title="Yutis Care"
      subtitle="平台管理"
      user={{ name: me.name, role: me.role }}
      onSignOut={onSignOut}
      nav={close => visibleNav(NAV, me).map(g => (
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
