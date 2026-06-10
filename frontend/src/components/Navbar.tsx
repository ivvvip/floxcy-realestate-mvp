'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Building2, Menu, X, ChevronDown } from 'lucide-react';
import { Container } from './Container';
import { cn } from '@/lib/cn';
import { useT } from '@/i18n/useT';
import { LocaleToggle } from './LocaleToggle';

// href + i18n key. Add new keys under `nav.*` in en.json + ar.json.
type Item = { href: string; key: string };

const PRIMARY: Item[] = [
  { href: '/areas', key: 'nav.areas' },
  { href: '/map', key: 'nav.map' },
  { href: '/offplan', key: 'nav.offplan' },
  { href: '/advisor', key: 'nav.ai_analyst' },
  { href: '/dashboard', key: 'nav.dashboard' },
];

const TOOLS: Item[] = [
  { href: '/timing', key: 'nav.timing' },
  { href: '/cycle', key: 'nav.cycle' },
  { href: '/compare', key: 'nav.compare' },
  { href: '/visa', key: 'nav.visa' },
  { href: '/rent-check', key: 'nav.rent_check' },
  { href: '/roi-calculator', key: 'nav.roi_calculator' },
  { href: '/opportunities', key: 'nav.opportunities' },
];

const MORE: Item[] = [
  { href: '/buildings', key: 'nav.buildings' },
  { href: '/brokers/directory', key: 'nav.brokers' },
  { href: '/learn', key: 'nav.learn' },
];

const ALL_MOBILE: { label: string; items: Item[] }[] = [
  { label: '', items: PRIMARY },
  { label: 'nav.tools', items: TOOLS },
  { label: 'nav.more', items: MORE },
];

function isActive(pathname: string | null, href: string): boolean {
  return href === '/' ? pathname === '/' : !!pathname?.startsWith(href);
}

export function Navbar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menu, setMenu] = useState<null | 'tools' | 'more'>(null);
  const t = useT();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/95 backdrop-blur-md">
      <Container>
        <nav className="flex h-14 items-center justify-between gap-2">
          <Link href="/" className="flex items-center gap-2 shrink-0" onClick={() => setMobileOpen(false)}>
            <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-card text-accent">
              <Building2 className="h-4 w-4" strokeWidth={2} />
            </span>
            <span className="text-sm font-semibold tracking-tight text-fg">Floxcy</span>
            <span className="hidden sm:inline text-[11px] text-fg-subtle">· {t('nav.brand_tag')}</span>
          </Link>

          {/* Desktop nav — only at lg+ (≥1024px); hamburger below that */}
          <ul className="hidden items-center gap-0.5 lg:flex">
            {PRIMARY.map((l) => (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={cn(
                    'relative px-3 py-2 text-sm font-medium transition-colors whitespace-nowrap',
                    isActive(pathname, l.href)
                      ? 'text-fg after:absolute after:inset-x-3 after:-bottom-px after:h-px after:bg-accent'
                      : 'text-fg-muted hover:text-fg'
                  )}
                >
                  {t(l.key)}
                </Link>
              </li>
            ))}
            <DesktopDropdown id="tools" label={t('nav.tools')} items={TOOLS} open={menu === 'tools'} setOpen={setMenu} pathname={pathname} t={t} />
            <DesktopDropdown id="more" label={t('nav.more')} items={MORE} open={menu === 'more'} setOpen={setMenu} pathname={pathname} t={t} />
          </ul>

          <div className="hidden items-center gap-2 lg:flex">
            <LocaleToggle />
            <Link
              href="/roi-calculator"
              className="inline-flex h-8 items-center justify-center rounded-md bg-accent px-3 text-xs font-medium text-accent-fg transition-colors hover:bg-accent/90 whitespace-nowrap"
            >
              {t('nav.calculate_roi')}
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={mobileOpen}
            onClick={() => setMobileOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-md border border-border text-fg-muted hover:text-fg lg:hidden"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </nav>
      </Container>

      {/* Mobile menu — animated slide/fade, all items, 44px tap targets */}
      <div
        className={cn(
          'lg:hidden overflow-hidden border-border bg-bg transition-all duration-200 ease-out',
          mobileOpen ? 'max-h-[85vh] overflow-y-auto border-t opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        <Container>
          <div className="py-2">
            {ALL_MOBILE.map((group) => (
              <div key={group.label || 'primary'} className="py-1">
                {group.label && (
                  <div className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                    {t(group.label)}
                  </div>
                )}
                <ul className="flex flex-col">
                  {group.items.map((l) => (
                    <li key={l.href}>
                      <Link
                        href={l.href}
                        onClick={() => setMobileOpen(false)}
                        className={cn(
                          'flex items-center min-h-[44px] px-3 text-sm font-medium border-b border-border/40 last:border-b-0',
                          isActive(pathname, l.href) ? 'text-accent' : 'text-fg-muted hover:text-fg'
                        )}
                      >
                        {t(l.key)}
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
            <Link
              href="/roi-calculator"
              onClick={() => setMobileOpen(false)}
              className="mt-3 mb-2 flex min-h-[44px] w-full items-center justify-center rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg"
            >
              {t('nav.calculate_roi')}
            </Link>
            <div className="flex justify-center pb-2">
              <LocaleToggle />
            </div>
          </div>
        </Container>
      </div>
    </header>
  );
}

function DesktopDropdown({
  id, label, items, open, setOpen, pathname, t,
}: {
  id: 'tools' | 'more';
  label: string;
  items: Item[];
  open: boolean;
  setOpen: (v: null | 'tools' | 'more') => void;
  pathname: string | null;
  t: (k: string) => string;
}) {
  const groupActive = items.some((i) => isActive(pathname, i.href));
  return (
    <li className="relative">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(open ? null : id)}
        className={cn(
          'inline-flex items-center gap-1 px-3 py-2 text-sm font-medium transition-colors',
          open || groupActive ? 'text-fg' : 'text-fg-muted hover:text-fg'
        )}
      >
        {label}
        <ChevronDown className={cn('h-3.5 w-3.5 transition-transform', open && 'rotate-180')} strokeWidth={2.5} />
      </button>
      {open && (
        <>
          {/* click-away backdrop */}
          <div className="fixed inset-0 z-10" onClick={() => setOpen(null)} aria-hidden />
          <div className="absolute right-0 top-full z-20 mt-1 min-w-[190px] rounded-lg border border-border bg-bg-card py-1 shadow-xl">
            {items.map((it) => (
              <Link
                key={it.href}
                href={it.href}
                onClick={() => setOpen(null)}
                className={cn(
                  'block px-3 py-2 text-sm transition-colors',
                  isActive(pathname, it.href) ? 'text-accent bg-accent/5' : 'text-fg-muted hover:text-fg hover:bg-bg-elev/50'
                )}
              >
                {t(it.key)}
              </Link>
            ))}
          </div>
        </>
      )}
    </li>
  );
}
