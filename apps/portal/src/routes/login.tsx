import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { SignInPage } from '@yutis/sign-in';
import { useTranslation } from 'react-i18next';
import { api, clearSession, tenantQuery } from '../api';
import { LanguageSelect } from '../LanguageSelect';
import { loginSearch, safeRedirect, signInText } from '../sign-in';

export const Route = createFileRoute('/login')({
  validateSearch: loginSearch,
  loader: ({ context }) => context.queryClient.ensureQueryData(tenantQuery),
  component: LoginPage,
});

/** The shared sign-in page as an employee, in the portal's language; afterwards back to where the person was. */
function LoginPage() {
  const { t } = useTranslation();
  const tenant = Route.useLoaderData();
  const { redirect, expired } = Route.useSearch();
  const { queryClient } = Route.useRouteContext();
  const navigate = useNavigate();
  const text = signInText(t);

  return (
    <SignInPage api={api} tenant={tenant} as="employee" emailLinkUrl={`${window.location.origin}${import.meta.env.BASE_URL}login`}
      text={expired ? { ...text, subtitle: t('signIn.expired') } : text} headerEnd={<LanguageSelect />}
      onSignedIn={() => {
        // A new session: nothing cached from before (another person on a shared phone, or a staff account) may show.
        clearSession(queryClient);
        void navigate({ href: safeRedirect(redirect), replace: true });
      }} />
  );
}
