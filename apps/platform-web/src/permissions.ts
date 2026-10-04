/*
 * What the signed-in person's platform role may do, from GET /platform-api/me (apps/platform-api/src/auth/permissions.ts).
 * The screens hide or disable what the role cannot do; the API still checks every call.
 */
import { createContext, useContext } from 'react';
import type { Permission, PlatformMe } from './api';

export const can = (me: Pick<PlatformMe, 'permissions'> | null | undefined, permission: Permission) => !!me?.permissions.includes(permission);

/** Menu items a role may open, without groups left empty. */
export function visibleNav<G extends { items: readonly { permission?: Permission }[] }>(nav: readonly G[], me: Pick<PlatformMe, 'permissions'>): G[] {
  return nav.map(g => ({ ...g, items: g.items.filter(i => !i.permission || can(me, i.permission)) })).filter(g => g.items.length > 0);
}

export const MeContext = createContext<PlatformMe | null>(null);

/** The signed-in person; pages render only once it is known (routes/__root.tsx). */
export function useMe(): PlatformMe {
  const me = useContext(MeContext);
  if (!me) throw new Error('useMe() outside the signed-in layout');
  return me;
}

export const useCan = (permission: Permission) => can(useMe(), permission);
