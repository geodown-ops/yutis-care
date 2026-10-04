import type { QueryClient } from '@tanstack/react-query';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';

/** Sign-in lives at /login; everything else is under the signed-in `_app` layout. */
export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({ component: Outlet });
