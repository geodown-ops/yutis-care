/*
 * Identity Platform (Firebase Auth) in the browser: get an ID token for the tenant's Identity Platform tenant, which
 * POST /api/auth/sign-in turns into our own session cookie. Firebase keeps nothing (in-memory persistence), so the
 * session cookie is the only sign-in state. Loaded on demand: dev and demo sign-in never download Firebase.
 */
import type { IdentityPlatformConfig } from '@yutis/api-client';
import type { Auth } from 'firebase/auth';

type FirebaseAuthModule = typeof import('firebase/auth');

const instances = new Map<string, Promise<{ auth: Auth; fa: FirebaseAuthModule }>>();

function load(cfg: IdentityPlatformConfig) {
  let p = instances.get(cfg.tenantId);
  if (!p) {
    p = (async () => {
      const [{ initializeApp }, fa] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
      const app = initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain }, `yutis-${cfg.tenantId}`);
      const auth = fa.initializeAuth(app, { persistence: fa.inMemoryPersistence, popupRedirectResolver: fa.browserPopupRedirectResolver });
      auth.tenantId = cfg.tenantId;
      return { auth, fa };
    })();
    instances.set(cfg.tenantId, p);
  }
  return p;
}

/** How a provider id is signed in to: `saml.*` SAML, `google.com` Google, anything else (`oidc.*`, `microsoft.com`) OAuth/OIDC. */
export function providerKind(id: string): 'saml' | 'google' | 'oauth' {
  if (id.startsWith('saml.')) return 'saml';
  if (id === 'google.com') return 'google';
  return 'oauth';
}

export async function signInWithSso(cfg: IdentityPlatformConfig, providerId: string): Promise<string> {
  const { auth, fa } = await load(cfg);
  const kind = providerKind(providerId);
  const provider = kind === 'saml' ? new fa.SAMLAuthProvider(providerId) : kind === 'google' ? new fa.GoogleAuthProvider() : new fa.OAuthProvider(providerId);
  const { user } = await fa.signInWithPopup(auth, provider);
  return user.getIdToken();
}

export async function signInWithPassword(cfg: IdentityPlatformConfig, email: string, password: string): Promise<string> {
  const { auth, fa } = await load(cfg);
  const { user } = await fa.signInWithEmailAndPassword(auth, email, password);
  return user.getIdToken();
}

const EMAIL_KEY = 'yutis.signInEmail';

/** Emails a one-time sign-in link that opens `continueUrl` (this app's /login). Remembers the address on this device. */
export async function sendEmailLink(cfg: IdentityPlatformConfig, email: string, continueUrl: string): Promise<void> {
  const { auth, fa } = await load(cfg);
  await fa.sendSignInLinkToEmail(auth, email, { url: continueUrl, handleCodeInApp: true });
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* private mode: the page asks for the address again */ }
}

/** Whether this URL is an Identity Platform email sign-in link, without loading Firebase. */
export function isEmailLink(href: string): boolean {
  try {
    const p = new URL(href).searchParams;
    return p.get('mode') === 'signIn' && !!p.get('oobCode');
  } catch {
    return false;
  }
}

/** The address the link was sent to from this device, if any. */
export function rememberedEmail(): string | null {
  try { return localStorage.getItem(EMAIL_KEY); } catch { return null; }
}

export async function completeEmailLink(cfg: IdentityPlatformConfig, email: string, href: string): Promise<string> {
  const { auth, fa } = await load(cfg);
  const { user } = await fa.signInWithEmailLink(auth, email, href);
  try { localStorage.removeItem(EMAIL_KEY); } catch { /* nothing to clean */ }
  return user.getIdToken();
}
