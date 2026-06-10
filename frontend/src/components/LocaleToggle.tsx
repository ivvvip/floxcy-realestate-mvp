'use client';

import { usePathname } from 'next/navigation';
import { Globe } from 'lucide-react';
import { DEFAULT_LOCALE, type Locale } from '@/i18n';

/**
 * EN ⇄ AR language toggle.
 *
 * Uses plain <a> (hard navigation) on purpose: the locale drives `dir`/`lang`
 * on the root layout (a server component), which only re-evaluates on a full
 * request. Navigating to `/ar…` or `/en…` makes middleware set the NEXT_LOCALE
 * cookie and rewrite back to the bare path, so the choice persists afterwards.
 */
export function LocaleToggle({ locale = DEFAULT_LOCALE, className = '' }: { locale?: Locale; className?: string }) {
  const pathname = usePathname() || '/';
  const rest = pathname === '/' ? '' : pathname;
  const enHref = `/en${rest}` || '/en';
  const arHref = `/ar${rest}` || '/ar';

  return (
    <div className={`inline-flex items-center rounded-md border border-border bg-bg-card text-[11px] font-medium overflow-hidden ${className}`}>
      <Globe className="h-3 w-3 text-fg-subtle mx-1.5" strokeWidth={2} aria-hidden />
      <a
        href={enHref}
        aria-current={locale === 'en' ? 'true' : undefined}
        className={locale === 'en' ? 'px-2 py-1 bg-accent text-accent-fg' : 'px-2 py-1 text-fg-muted hover:text-fg'}
      >
        EN
      </a>
      <a
        href={arHref}
        aria-current={locale === 'ar' ? 'true' : undefined}
        className={locale === 'ar' ? 'px-2 py-1 bg-accent text-accent-fg' : 'px-2 py-1 text-fg-muted hover:text-fg'}
        lang="ar"
      >
        ع
      </a>
    </div>
  );
}
