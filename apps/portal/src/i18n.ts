/*
 * Employee-side translations. NMQ and CBI wording comes from the prototype (prototype/data.js); the app chrome and
 * the questionnaires in 日本語, Tiếng Việt and ภาษาไทย still need a native speaker's review.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import app from './locales/app.json';
import nmq from './locales/nmq.json';
import workload from './locales/workload.json';

export const LANGS = { zh: '中文', en: 'English', ja: '日本語', vi: 'Tiếng Việt', th: 'ภาษาไทย' } as const;
export type Lang = keyof typeof LANGS;
export const LANG_CODES = Object.keys(LANGS) as Lang[];

const STORAGE_KEY = 'yutis.lang';

function savedLang(): Lang | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGS) return saved as Lang;
  } catch { /* storage unavailable */ }
  return null;
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANG_CODES.map(l => [l, { app: app[l], nmq: nmq[l], workload: workload[l] }])),
  lng: typeof window === 'undefined' ? 'zh' : savedLang() ?? 'zh',
  fallbackLng: 'zh',
  ns: ['app', 'nmq', 'workload'],
  defaultNS: 'app',
  interpolation: { escapeValue: false },
});

// <html lang> follows the language, so screen readers read it right and Japanese gets Japanese glyph forms.
const HTML_LANG: Record<Lang, string> = { zh: 'zh-Hant-TW', en: 'en', ja: 'ja', vi: 'vi', th: 'th' };
if (typeof document !== 'undefined') {
  const apply = (l: string) => { document.documentElement.lang = HTML_LANG[l as Lang] ?? l; };
  apply(i18n.language);
  i18n.on('languageChanged', apply);
}

/** Language is a preference, not health data, so it may live in the browser. */
export function setLang(lang: Lang) {
  void i18n.changeLanguage(lang);
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

/** After sign-in: the language in the employee master, unless the person already chose one on this device. */
export function applyProfileLang(lang: string) {
  if (typeof window === 'undefined' || savedLang() || !(lang in LANGS) || i18n.language === lang) return;
  void i18n.changeLanguage(lang);
}

export default i18n;
