/*
 * Platform staff sign-in where no Identity-Aware Proxy guards the platform admin (Railway): Google accounts through
 * the Identity Platform project itself, never a customer's tenant. There is no session cookie: every /platform-api
 * request carries the current ID token, which Firebase refreshes. The sign-in lasts as long as the browser tab
 * (session persistence), so closing the tab signs out. Firebase is loaded only when this sign-in is in use.
 */
import type { Auth } from 'firebase/auth';

export interface PlatformSignInConfig { apiKey: string; authDomain: string }
export interface PlatformAccount { email: string | null; name: string | null }

type FirebaseAuthModule = typeof import('firebase/auth');
let instance: Promise<{ auth: Auth; fa: FirebaseAuthModule }> | undefined;

function load(cfg: PlatformSignInConfig) {
  instance ??= (async () => {
    const [{ initializeApp }, fa] = await Promise.all([import('firebase/app'), import('firebase/auth')]);
    const app = initializeApp({ apiKey: cfg.apiKey, authDomain: cfg.authDomain }, 'yutis-platform');
    const auth = fa.initializeAuth(app, { persistence: fa.browserSessionPersistence, popupRedirectResolver: fa.browserPopupRedirectResolver });
    return { auth, fa };
  })();
  return instance;
}

const account = (u: { email: string | null; displayName: string | null } | null): PlatformAccount | null =>
  u && { email: u.email, name: u.displayName };

/** Who is signed in on this tab, once Firebase has restored it; null when nobody is. */
export async function platformAccount(cfg: PlatformSignInConfig): Promise<PlatformAccount | null> {
  const { auth } = await load(cfg);
  await auth.authStateReady();
  return account(auth.currentUser);
}

/** Google sign-in in a popup, always offering the account chooser so a personal account is not picked silently. */
export async function signInPlatform(cfg: PlatformSignInConfig): Promise<PlatformAccount> {
  const { auth, fa } = await load(cfg);
  const provider = new fa.GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  const { user } = await fa.signInWithPopup(auth, provider);
  return account(user)!;
}

/** The ID token for the Authorization header, refreshed when close to expiry; null when nobody is signed in. */
export async function platformIdToken(cfg: PlatformSignInConfig): Promise<string | null> {
  const { auth } = await load(cfg);
  await auth.authStateReady();
  return auth.currentUser ? auth.currentUser.getIdToken() : null;
}

export async function signOutPlatform(cfg: PlatformSignInConfig): Promise<void> {
  const { auth, fa } = await load(cfg);
  await fa.signOut(auth);
}
