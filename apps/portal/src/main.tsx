import './i18n';
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AppProviders } from '@yutis/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { clearSession, isUnauthorized, meQuery, retryServerErrors } from './api';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: retryServerErrors } },
  queryCache: new QueryCache({ onError: sessionEnded }),
  mutationCache: new MutationCache({ onError: sessionEnded }),
});
const router = createRouter({ routeTree, basepath: '/me', context: { queryClient }, defaultPreload: 'intent', scrollRestoration: true });

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
}

/**
 * The one place a lapsed session is handled: after 15 idle minutes (or a sign-out elsewhere) any call answers 401,
 * and the person signs in again and comes back to the same page. Before anyone has signed in, `me` has no data and
 * the _employee route sends them to /login itself. Clearing `me` first makes the other failing calls a no-op.
 */
function sessionEnded(err: unknown) {
  if (!isUnauthorized(err) || queryClient.getQueryData(meQuery.queryKey) === undefined) return;
  const { href, pathname } = router.state.location;
  clearSession(queryClient);
  if (pathname !== '/login') void router.navigate({ to: '/login', search: { redirect: href, expired: true } });
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <AppProviders>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </AppProviders>
  </StrictMode>,
);
