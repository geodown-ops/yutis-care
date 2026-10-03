import { createFileRoute, Navigate } from '@tanstack/react-router';
import { splat } from '../links';
import { navFor } from '../nav';
import { HomePage } from '../pages/HomePage';
import { useMe } from '../session';

export const Route = createFileRoute('/')({ component: Index });

/** The nurse home is the landing page for care staff; other roles land on their first menu item. */
function Index() {
  const me = useMe();
  const first = navFor(me.role)[0]?.items[0];
  if (first && first.path !== '/') return <Navigate {...splat(first.path)} replace />;
  return <HomePage />;
}
