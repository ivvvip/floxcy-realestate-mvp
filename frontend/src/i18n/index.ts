/**
 * Floxcy i18n — translation lookup + locale plumbing.
 *
 * Design notes:
 *  - App Router doesn't ship the old pages-router `i18n.locales` config.
 *    Instead we detect locale from the URL path (`/ar/...`) via middleware
 *    and stash it in a cookie. Server components read the cookie; client
 *    components read the document <html lang> attribute.
 *  - Right now every Arabic value mirrors English (per spec — infra only,
 *    no translations yet). When real Arabic copy ships, replace values in
 *    ar.json — no component changes needed.
 *  - t('a.b.c') walks dotted keys. Missing keys return the key itself so a
 *    missed extraction is visible (not silently blank).
 *  - For numbers/dates use formatNumber()/formatAED() with a locale arg.
 *
 * Usage:
 *   // Server component
 *   import { getLocale, getT } from '@/i18n';
 *   const locale = getLocale();   // 'en' | 'ar'
 *   const t = getT(locale);
 *   return <h1>{t('areas.title')}</h1>;
 *
 *   // Client component
 *   import { useLocale, useT } from '@/i18n/useT';
 *   const t = useT();
 *   return <h1>{t('areas.title')}</h1>;
 */
import en from './en.json';
import ar from './ar.json';
// Server-only imports (cookies, headers) live in ./server.ts so this
// module stays safe to import from both server AND client components.

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = 'en';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

const DICTS: Record<Locale, Record<string, unknown>> = { en, ar };

export function isLocale(s: string | null | undefined): s is Locale {
  return s === 'en' || s === 'ar';
}

export function dirFor(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

/**
 * Lookup a dotted-path key in the locale dictionary.
 * Returns the key itself on miss so missing extractions are visible during dev.
 *
 *   t('nav.areas')           // → "Areas"
 *   t('does.not.exist')      // → "does.not.exist"
 *
 * For pluralisation or interpolation, prefer composing strings in JSX
 * rather than encoding into the message — keeps the dictionary flat.
 */
export function translate(locale: Locale, key: string): string {
  const dict = DICTS[locale];
  let cursor: unknown = dict;
  for (const part of key.split('.')) {
    if (cursor && typeof cursor === 'object' && part in (cursor as Record<string, unknown>)) {
      cursor = (cursor as Record<string, unknown>)[part];
    } else {
      return key;
    }
  }
  return typeof cursor === 'string' ? cursor : key;
}

// Server-side helpers (getLocale, getT) live in ./server.ts — split so this
// module can be safely imported from client components.

export function makeT(locale: Locale) {
  return (key: string) => translate(locale, key);
}

// -----------------------------------------------------------------------------
// Number / currency formatters with locale awareness
// -----------------------------------------------------------------------------

const NUMBER_LOCALE: Record<Locale, string> = {
  en: 'en-US',
  ar: 'ar-AE',   // Arabic (UAE) — uses Western digits in modern browsers; toggle
  //               // to 'ar-EG' for Eastern Arabic numerals (١٢٣) if desired.
};

export function formatNumberLocale(
  value: number,
  locale: Locale,
  opts?: Intl.NumberFormatOptions
): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], opts).format(value);
}

export function formatAEDLocale(value: number, locale: Locale): string {
  if (!Number.isFinite(value)) return '—';
  return new Intl.NumberFormat(NUMBER_LOCALE[locale], {
    style: 'currency',
    currency: 'AED',
    maximumFractionDigits: 0,
  }).format(value);
}
