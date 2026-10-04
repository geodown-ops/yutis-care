import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '@yutis/sign-in';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { meQuery, tenantQuery, useTenant } from '../session';

/** Only same-site paths, so a crafted link cannot send people elsewhere after signing in. */
const safePath = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : undefined);

export const Route = createFileRoute('/login')({
  // Identity Platform's email links add their own parameters (mode, oobCode, …); keep them for the sign-in page.
  validateSearch: (s: Record<string, unknown>): { redirect?: string } => ({ ...s, redirect: safePath(s.redirect) }),
  beforeLoad: async ({ context: { queryClient }, search }) => {
    const me = await queryClient.fetchQuery(meQuery).catch(() => null);
    if (me?.kind === 'staff') throw redirect({ href: search.redirect ?? '/' });
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(tenantQuery),
  component: function Login() {
    const tenant = useTenant();
    const { redirect: to } = Route.useSearch();
    const navigate = Route.useNavigate();
    const qc = useQueryClient();
    return (
      <SignInPage api={api} tenant={tenant} as="staff" emailLinkUrl={`${window.location.origin}/login`}
        onSignedIn={() => { qc.removeQueries({ queryKey: ['me'] }); void navigate({ href: to ?? '/' }); }} />
    );
  },
});
