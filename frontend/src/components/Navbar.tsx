'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Container } from './Container';
import { cn } from '@/lib/cn';

const LINKS = [
  { href: '/', label: 'Home' },
  { href: '/areas', label: 'Areas' },
  { href: '/roi-calculator', label: 'ROI Calculator' },
];

export function Navbar() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-bg/70 backdrop-blur-xl">
      <Container>
        <nav className="flex h-16 items-center justify-between">
          <Link
            href="/"
            className="flex items-center gap-2.5"
            onClick={() => setOpen(false)}
          >
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg shadow-glow">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-4 w-4"
                aria-hidden
              >
                <path d="M3 21V10l9-7 9 7v11" />
                <path d="M9 21v-7h6v7" />
              </svg>
            </span>
            <span className="text-base font-semibold tracking-tight text-fg">
              Floxcy
            </span>
          </Link>

          <ul className="hidden items-center gap-1 md:flex">
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
                      'rounded-lg px-3.5 py-2 text-sm font-medium transition-colors',
                      active
                        ? 'text-fg bg-bg-elev'
                        : 'text-fg-muted hover:text-fg hover:bg-bg-elev/60'
                    )}
                  >
                    {l.label}
                  </Link>
                </li>
              );
            })}
          </ul>

          <div className="hidden items-center gap-3 md:flex">
            <Link
              href="/roi-calculator"
              className="inline-flex h-9 items-center justify-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-glow transition-colors hover:bg-accent/90"
            >
              Calculate ROI
            </Link>
          </div>

          <button
            type="button"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
            className="grid h-10 w-10 place-items-center rounded-lg border border-border text-fg-muted hover:text-fg md:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
            >
              {open ? (
                <>
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </>
              ) : (
                <>
                  <line x1="4" y1="6" x2="20" y2="6" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="18" x2="20" y2="18" />
                </>
              )}
            </svg>
          </button>
        </nav>
      </Container>

      {open && (
        <div className="border-t border-border bg-bg/95 md:hidden">
          <Container>
            <ul className="flex flex-col py-3">
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
                        'block rounded-lg px-3 py-3 text-sm font-medium transition-colors',
                        active
                          ? 'text-fg bg-bg-elev'
                          : 'text-fg-muted hover:text-fg hover:bg-bg-elev/60'
                      )}
                    >
                      {l.label}
                    </Link>
                  </li>
                );
              })}
              <li className="pt-2">
                <Link
                  href="/roi-calculator"
                  onClick={() => setOpen(false)}
                  className="block w-full rounded-xl bg-accent px-4 py-3 text-center text-sm font-medium text-accent-fg shadow-glow"
                >
                  Calculate ROI
                </Link>
              </li>
            </ul>
          </Container>
        </div>
      )}
    </header>
  );
}
