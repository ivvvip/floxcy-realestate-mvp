'use client';

/**
 * Client-side locale + translate hook.
 *
 * Reads <html lang> at mount and on URL changes. This works without
 * additional providers because middleware always sets <html lang> via
 * the cookie → server-side getLocale() chain.
 */
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { DEFAULT_LOCALE, isLocale, translate, type Locale } from './index';

export function useLocale(): Locale {
  const pathname = usePathname();
  const [locale, setLocale] = useState<Locale>(DEFAULT_LOCALE);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const fromHtml = document.documentElement.getAttribute('lang');
    if (isLocale(fromHtml)) setLocale(fromHtml);
  }, [pathname]);

  return locale;
}

export function useT() {
  const locale = useLocale();
  return (key: string) => translate(locale, key);
}
