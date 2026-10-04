import { createFileRoute, Navigate } from '@tanstack/react-router';
import { splat } from '../../links';
import { canAccess, navFor } from '../../nav';
import { HomePage } from '../../pages/HomePage';
import { useMe } from '../../session';

export const Route = createFileRoute('/_app/')({ component: Index });

/** The nurse home is the landing page for care staff; other roles land on their first menu item. */
function Index() {
  const me = useMe();
  if (canAccess(me, { feature: 'nurse-home' })) return <HomePage />;
  const first = navFor(me)[0]?.items[0];
  return first ? <Navigate {...splat(first.path)} replace /> : null;
}
