import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

// Locale registry: `id` is the stored value + document lang, `dir` drives RTL,
// `native` is shown in the language menu. English is the source language, so
// only non-English locales need dictionaries — `t()` falls back to the
// English fallback whenever a key is missing.
export const LOCALES = [
  { id: 'en', name: 'English',  native: 'English',   dir: 'ltr' },
  { id: 'ar', name: 'Arabic',   native: 'العربية',   dir: 'rtl' },
  { id: 'de', name: 'German',   native: 'Deutsch',   dir: 'ltr' },
  { id: 'fr', name: 'French',   native: 'Français',  dir: 'ltr' },
  { id: 'es', name: 'Spanish',  native: 'Español',   dir: 'ltr' },
  { id: 'tr', name: 'Turkish',  native: 'Türkçe',    dir: 'ltr' },
];

const LOCALE_IDS = new Set(LOCALES.map((l) => l.id));
const RTL = new Set(LOCALES.filter((l) => l.dir === 'rtl').map((l) => l.id));

// Non-English dictionaries are code-split into separate chunks and loaded on
// demand. Previously all five (~135 kB source) shipped inside the initial
// bundle paid by every visitor, including English-only users who never read a
// single translated string. English needs no dictionary: t() returns the
// fallback directly.
const localeLoaders = {
  ar: () => import('./locales/ar.js'),
  de: () => import('./locales/de.js'),
  fr: () => import('./locales/fr.js'),
  es: () => import('./locales/es.js'),
  tr: () => import('./locales/tr.js'),
};
const localeCache = {};

const I18nContext = createContext({
  locale: 'en',
  dir: 'ltr',
  ready: true,
  t: (_key, fallback) => fallback || _key,
  setLocale: () => {},
  toggleLocale: () => {},
});

function initialLocale() {
  try {
    const stored = localStorage.getItem('eb.locale');
    if (stored && LOCALE_IDS.has(stored)) return stored;
  } catch { /* ignore */ }
  try {
    const prefix = navigator.language?.toLowerCase().split('-')[0];
    if (prefix && LOCALE_IDS.has(prefix)) return prefix;
  } catch { /* ignore */ }
  return 'en';
}

export function LanguageProvider({ children }) {
  const [locale, setLocaleState] = useState(initialLocale);
  const [dict, setDict] = useState(null);
  const [dictLocale, setDictLocale] = useState('en');
  const dir = RTL.has(locale) ? 'rtl' : 'ltr';

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = dir;
    try { localStorage.setItem('eb.locale', locale); } catch { /* ignore */ }
  }, [locale, dir]);

  useEffect(() => {
    if (locale === 'en') {
      setDict(null);
      setDictLocale('en');
      return undefined;
    }
    if (localeCache[locale]) {
      setDict(localeCache[locale]);
      setDictLocale(locale);
      return undefined;
    }
    // Show the English fallback while the chunk loads instead of the
    // previous language: keys are shared, so a stale dictionary would render
    // a full UI in the wrong language for one tick.
    setDictLocale(null);
    let cancelled = false;
    localeLoaders[locale]().then((mod) => {
      const loaded = mod.default || mod;
      localeCache[locale] = loaded;
      if (!cancelled) {
        setDict(loaded);
        setDictLocale(locale);
      }
    }).catch(() => {
      if (!cancelled) {
        setDict(null);
        setDictLocale(null);
      }
    });
    return () => { cancelled = true; };
  }, [locale]);

  const value = useMemo(() => ({
    locale,
    dir,
    locales: LOCALES,
    ready: locale === 'en' || dictLocale === locale,
    t: (key, fallback) => {
      if (locale === 'en') return fallback || key;
      if (dictLocale === locale && dict && dict[key]) return dict[key];
      return fallback || key;
    },
    setLocale: (next) => {
      if (LOCALE_IDS.has(next)) setLocaleState(next);
    },
    toggleLocale: () => setLocaleState((current) => {
      const i = LOCALES.findIndex((l) => l.id === current);
      return LOCALES[(i + 1) % LOCALES.length].id;
    }),
  }), [locale, dir, dict, dictLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}
