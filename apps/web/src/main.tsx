import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AppProviders } from '@yutis/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { PageError, PageLoader } from './pages/states';
import { routeTree } from './routeTree.gen';
import { isUnauthorized } from './session';

/** A 401 anywhere means the session ended (15 minutes idle, 12 hours at most): back to sign-in, keeping the page. */
function onApiError(err: unknown) {
  if (!isUnauthorized(err) || router.state.location.pathname === '/login') return;
  queryClient.clear();
  void router.navigate({ to: '/login', search: { redirect: router.state.location.href } });
}

const queryClient = new QueryClient({
  queryCache: new QueryCache({ onError: onApiError }),
  mutationCache: new MutationCache({ onError: onApiError }),
  defaultOptions: { queries: { retry: (n, err) => !isUnauthorized(err) && n < 2 } },
});
const router = createRouter({
  routeTree,
  context: { queryClient },
  defaultPreload: 'intent',
  // Loaders read through the query cache, so the router never holds its own stale copy.
  defaultPreloadStaleTime: 0,
  scrollRestoration: true,
  defaultPendingComponent: PageLoader,
  defaultErrorComponent: ({ error, reset }) => <PageError error={error} reset={reset} />,
});

declare module '@tanstack/react-router' {
  interface Register { router: typeof router }
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
