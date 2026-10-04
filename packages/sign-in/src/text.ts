import type { SignInProblem } from './errors';

/** Everything the sign-in page says. The back office uses the Chinese defaults; the portal passes its translations. */
export interface SignInText {
  title: string;
  subtitle: string;
  /** `{provider}` is replaced with the provider's label, e.g. Microsoft Entra ID. */
  sso: string;
  or: string;
  email: string;
  password: string;
  signIn: string;
  sendLink: string;
  /** `{email}` is replaced with the address. */
  linkSent: string;
  confirmEmail: string;
  completing: string;
  devLabel: string;
  devHint: string;
  demoAccounts: string;
  noMethods: string;
  problems: Record<SignInProblem, string>;
}

export const STAFF_TEXT: SignInText = {
  title: '登入',
  subtitle: '後台人員請用公司帳號登入。',
  sso: '使用 {provider} 登入',
  or: '或',
  email: 'Email',
  password: '密碼',
  signIn: '登入',
  sendLink: '寄送登入連結',
  linkSent: '登入連結已寄到 {email}。請在這台裝置上開啟信中的連結。',
  confirmEmail: '請輸入收到登入連結的 Email，以完成登入。',
  completing: '正在登入…',
  devLabel: 'Email 或手機號碼',
  devHint: '示範與開發環境不需要密碼。請不要輸入任何真實的個人資料。',
  demoAccounts: '示範帳號',
  noMethods: '這個網址目前沒有可用的登入方式。請聯絡貴公司的租戶管理員。',
  problems: {
    noAccount: '找不到對應的後台帳號。請確認租戶管理員已邀請這個 Email。',
    notConfigured: '這個網址的登入服務還沒設定好。請聯絡 Yutis Care 客服。',
    tenantInactive: '這個租戶目前已停用。',
    tooMany: '嘗試次數太多，請稍後再試。',
    linkInvalid: '登入連結已失效或已使用過，請重新寄送。',
    wrongPassword: 'Email 或密碼不正確。',
    mfaRequired: '這個帳號需要兩步驟驗證，請改用公司帳號（SSO）登入。',
    disabled: '這個登入帳號已被停用。',
    failed: '登入失敗，請稍後再試。',
  },
};

/** `fill('使用 {provider} 登入', { provider: 'Google' })` */
export const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w+)\}/g, (m, k: string) => vars[k] ?? m);
