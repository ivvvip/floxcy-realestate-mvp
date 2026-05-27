import Link from 'next/link';
import { Building2 } from 'lucide-react';
import { Container } from './Container';

export function Footer() {
  return (
    <footer className="mt-16 border-t border-border bg-bg/60">
      <Container>
        <div className="grid gap-10 py-10 md:grid-cols-4">
          <div className="md:col-span-2">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-md border border-border bg-bg-card text-accent">
                <Building2 className="h-4 w-4" strokeWidth={2} />
              </span>
              <span className="text-sm font-semibold text-fg">Floxcy</span>
            </div>
            <p className="mt-3 max-w-sm text-xs leading-relaxed text-fg-muted">
              AI-powered investment intelligence for UAE real estate. Curated
              areas, transparent ROI, data-driven decisions.
            </p>
          </div>

          <div>
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Product
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li><Link href="/dashboard" className="text-fg-muted hover:text-fg transition-colors">Dashboard</Link></li>
              <li><Link href="/areas" className="text-fg-muted hover:text-fg transition-colors">Areas</Link></li>
              <li><Link href="/compare" className="text-fg-muted hover:text-fg transition-colors">Compare</Link></li>
              <li><Link href="/advisor" className="text-fg-muted hover:text-fg transition-colors">AI Investment Analyst</Link></li>
              <li><Link href="/roi-calculator" className="text-fg-muted hover:text-fg transition-colors">ROI Calculator</Link></li>
            </ul>
          </div>

          <div>
            <h4 className="text-[11px] font-medium uppercase tracking-wider text-fg-subtle">
              Resources
            </h4>
            <ul className="mt-3 space-y-2 text-xs">
              <li><span className="text-fg-muted">Dubai, UAE</span></li>
              <li>
                <a
                  href="https://api.floxcy.com/docs"
                  target="_blank"
                  rel="noreferrer"
                  className="text-fg-muted hover:text-fg transition-colors"
                >
                  API Documentation
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="flex flex-col items-start justify-between gap-2 border-t border-border py-5 text-[11px] text-fg-subtle md:flex-row md:items-center">
          <p>© {new Date().getFullYear()} Floxcy. All rights reserved.</p>
          <p className="tabular">Data delayed 15min · Methodology v0.1</p>
        </div>
      </Container>
    </footer>
  );
}
