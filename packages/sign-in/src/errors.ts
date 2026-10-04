import { ApiRequestError } from '@yutis/api-client';

/** What went wrong, as a key into the sign-in text. `null` means say nothing (the person closed the popup). */
export type SignInProblem =
  | 'noAccount' | 'notConfigured' | 'tenantInactive' | 'tooMany' | 'linkInvalid' | 'wrongPassword' | 'mfaRequired' | 'disabled' | 'failed';

export function signInProblem(err: unknown): SignInProblem | null {
  if (err instanceof ApiRequestError) {
    if (err.status === 401) return 'noAccount';
    if (err.code === 'sign_in_unavailable') return 'notConfigured';
    if (err.code === 'tenant_inactive') return 'tenantInactive';
    if (err.status === 429) return 'tooMany';
    return 'failed';
  }
  const code = (err as { code?: unknown } | null)?.code;
  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
    case 'auth/user-cancelled':
      return null;
    case 'auth/invalid-action-code':
    case 'auth/expired-action-code':
      return 'linkInvalid';
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
    case 'auth/invalid-email':
      return 'wrongPassword';
    case 'auth/too-many-requests':
      return 'tooMany';
    case 'auth/multi-factor-auth-required':
      return 'mfaRequired';
    case 'auth/user-disabled':
      return 'disabled';
    default:
      return 'failed';
  }
}
