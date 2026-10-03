/*
 * Employee-side translations. NMQ wording comes from the prototype (prototype/data.js); the app
 * chrome in 日本語, Tiếng Việt and ภาษาไทย still needs a native speaker's review.
 */
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import app from './locales/app.json';
import nmq from './locales/nmq.json';

export const LANGS = { zh: '中文', en: 'English', ja: '日本語', vi: 'Tiếng Việt', th: 'ภาษาไทย' } as const;
export type Lang = keyof typeof LANGS;
export const LANG_CODES = Object.keys(LANGS) as Lang[];

const STORAGE_KEY = 'yutis.lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && saved in LANGS) return saved as Lang;
  } catch { /* storage unavailable: fall back to Chinese */ }
  return 'zh';
}

void i18n.use(initReactI18next).init({
  resources: Object.fromEntries(LANG_CODES.map(l => [l, { app: app[l], nmq: nmq[l] }])),
  lng: typeof window === 'undefined' ? 'zh' : initialLang(),
  fallbackLng: 'zh',
  ns: ['app', 'nmq'],
  defaultNS: 'app',
  interpolation: { escapeValue: false },
});

/** Language is a preference, not health data, so it may live in the browser. */
export function setLang(lang: Lang) {
  void i18n.changeLanguage(lang);
  try { localStorage.setItem(STORAGE_KEY, lang); } catch { /* ignore */ }
}

export default i18n;
