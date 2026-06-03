'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Building2, Menu, X } from 'lucide-react';
import { Container } from './Container';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';

// href + i18n key. Adding a new nav link? Add the key to en.json + ar.json
// under `nav.*` and reference here.
const LINKS = [
  { href: '/dashboard', key: 'nav.dashboard' },
  { href: '/map', key: 'nav.map' },
  { href: '/areas', key: 'nav.areas' },
  { href: '/buildings', key: 'nav.buildings' },
  { href: '/opportunities', key: 'nav.opportunities' },
  { href: '/offplan', key: 'nav.offplan' },
  { href: '/compare', key: 'nav.compare' },
  { href: '/advisor', key: 'nav.ai_analyst' },
  { href: '/rent-check', key: 'nav.rent_check' },
  { href: '/brokers/directory', key: 'nav.brokers' },
  { href: '/learn', key: 'nav.learn' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const t = useT();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-md">
      <Container>
        <nav className="flex h-14 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2"
            onClick={() => setOpen(false)}
          >
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-card text-accent">
              <Building2 className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-fg">
              Floxcy
            </span>
            <span className="hidden sm:inline pill ml-1">{t('nav.brand_tag')}</span>
          </Link>

          <ul className="hidden items-center gap-0.5 md:flex">
            {LINKS.map((l) => {
              const active =
                l.href === '/'
                  ? pathname === '/'
                  : pathname?.startsWith(l.href);
              return (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className={cn(
                      'relative px-3 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-px after:bg-accent'
                        : 'text-fg-muted hover:text-fg'
                    )}
                  >
                    {t(l.key)}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-2 md:flex">
            <Link
              href="/roi-calculator"
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-accent-fg transition-colors hover:bg-accent/90"
            >
              {t('nav.calculate_roi')}
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-9 w-9 place-items-center rounded-md border border-border text-fg-muted hover:text-fg md:hidden"
          >
            {open ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </button>
        </nav>
      </Container>

      {open && (
        <div className="border-t border-border bg-bg md:hidden">
          <Container>
            <ul className="flex flex-col py-2">
              {LINKS.map((l) => {
                const active =
                  l.href === '/'
                    ? pathname === '/'
                    : pathname?.startsWith(l.href);
                return (
                  <li key={l.href}>
                    <Link
                      href={l.href}
                      onClick={() => setOpen(false)}
                      className={cn(
                        'block px-3 py-3 text-sm font-medium border-b border-border/60 last:border-b-0',
                        active
                          ? 'text-accent'
                          : 'text-fg-muted hover:text-fg'
                      )}
                    >
                      {t(l.key)}
                    </Link>
                  </li>
                );
              })}
              <li className="py-3">
                <Link
                  href="/roi-calculator"
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-md bg-accent px-4 py-2.5 text-center text-sm font-medium text-accent-fg"
                >
                  {t('nav.calculate_roi')}
                </Link>
              </li>
            </ul>
          </Container>
        </div>
      )}
    </header>
  );
}
