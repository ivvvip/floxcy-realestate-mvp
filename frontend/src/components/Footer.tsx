import Link from 'next/link';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="mt-24 border-t border-border bg-bg/60">
      <Container>
        <div className="grid gap-10 py-12 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-accent text-accent-fg">
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
              <span className="text-base font-semibold text-fg">Floxcy</span>
            </div>
            <p className="mt-4 max-w-sm text-sm text-fg-muted">
              AI-powered real estate investment intelligence for Dubai. Curated
              areas, transparent ROI, data-driven decisions.
            </p>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Product
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <Link
                  href="/areas"
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  Areas
                </Link>
              </li>
              <li>
                <Link
                  href="/roi-calculator"
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  ROI Calculator
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="text-xs font-semibold uppercase tracking-wider text-fg-subtle">
              Company
            </h4>
            <ul className="mt-4 space-y-2.5 text-sm">
              <li>
                <span className="text-fg-muted">Dubai, UAE</span>
              </li>
              <li>
                <a
                  href="https://api.floxcy.com/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg-muted transition-colors hover:text-fg"
                >
                  API Docs
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-3 border-t border-border py-6 text-xs text-fg-subtle md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Floxcy. All rights reserved.</p>
          <p>Built for Dubai real estate investors.</p>
        </div>
      </Container>
    </footer>
  );
}
