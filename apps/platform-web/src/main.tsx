import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRouter, RouterProvider } from '@tanstack/react-router';
import { AppProviders } from '@yutis/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { shouldRetry } from './api';
import { routeTree } from './routeTree.gen';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: shouldRetry } } });
const router = createRouter({ routeTree, context: { queryClient }, defaultPreload: 'intent' });

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
