/**
 * Server-only locale helpers. Imports `cookies` + `headers` from
 * next/headers which are NOT available in client components — keep this
 * file out of any 'use client' module's import chain.
 */
import { cookies, headers } from 'next/headers';
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE,
  isLocale,
  translate,
  type Locale,
} from './index';

export function getLocale(): Locale {
  const fromCookie = cookies().get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;
  // Fallback: look at the path. middleware sets the cookie on every
  // locale-prefixed request; this guards against direct server-render
  // during build when no cookie exists.
  const path = headers().get('x-next-pathname') ?? '';
  if (path.startsWith('/ar/') || path === '/ar') return 'ar';
  return DEFAULT_LOCALE;
}

export function getT(locale: Locale = DEFAULT_LOCALE) {
  return (key: string) => translate(locale, key);
}
