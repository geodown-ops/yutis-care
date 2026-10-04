import { createFileRoute, redirect } from '@tanstack/react-router';
import { SignInPage } from '@yutis/sign-in';
import { useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { meQuery, tenantQuery, useTenant } from '../session';

/** Only same-site paths, so a crafted link cannot send people elsewhere after signing in. */
const safePath = (v: unknown) => (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') ? v : undefined);

export const Route = createFileRoute('/login')({
  // Identity Platform's email links add their own parameters (mode, oobCode, …); keep them for the sign-in page.
  validateSearch: (s: Record<string, unknown>): { redirect?: string; expired?: boolean } =>
    ({ ...s, redirect: safePath(s.redirect), expired: s.expired === true || s.expired === 'true' || undefined }),
  beforeLoad: async ({ context: { queryClient }, search }) => {
    const me = await queryClient.fetchQuery(meQuery).catch(() => null);
    if (me?.kind === 'staff') throw redirect({ href: search.redirect ?? '/' });
  },
  loader: ({ context: { queryClient } }) => queryClient.ensureQueryData(tenantQuery),
  component: function Login() {
    const tenant = useTenant();
    const { redirect: to, expired } = Route.useSearch();
    const navigate = Route.useNavigate();
    const qc = useQueryClient();
    return (
      <SignInPage api={api} tenant={tenant} as="staff" emailLinkUrl={`${window.location.origin}/login`}
        notice={expired ? '你有一段時間沒有操作，已自動登出。請重新登入。' : undefined}
        onSignedIn={() => { qc.removeQueries({ queryKey: ['me'] }); void navigate({ href: to ?? '/' }); }} />
    );
  },
});
