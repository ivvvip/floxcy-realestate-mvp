import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Database } from 'lucide-react';
import { getMethodology } from '@/lib/api';

export const metadata = {
  title: 'Data Sources',
  description: 'Where Floxcy gets its real estate data, refresh cadence, and known limitations.',
};

export const revalidate = 3600;

export default async function DataSourcesPage() {
  const m = await getMethodology().catch(() => null);

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Data sources' }]} />
            <div className="mt-2 flex items-center gap-2">
              <Database className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                Data sources
              </h1>
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              The provenance behind every figure on Floxcy. We do not own this
              data — we license, scrape with permission, or aggregate from
              public registries.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 max-w-3xl space-y-6">
          {m && (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border rounded-lg overflow-hidden">
                {Object.entries(m.data_sources).map(([k, v]) => (
                  <div key={k} className="bg-bg-card p-5">
                    <div className="text-sm font-semibold text-fg">{v.name}</div>
                    <div className="mt-1 text-[11px] text-fg-subtle uppercase tracking-wide">
                      {v.type}
                    </div>
                    <div className="mt-2 text-xs text-fg-muted tabular">
                      Refresh cadence: <span className="text-fg">{v.frequency}</span>
                    </div>
                    {v.url && (
                      <a
                        href={v.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 inline-flex items-center gap-1 text-xs text-accent hover:underline"
                      >
                        Source documentation →
                      </a>
                    )}
                  </div>
                ))}
              </div>

              <section className="border border-border rounded-lg bg-bg-card p-5">
                <h2 className="text-sm font-medium text-fg">Known limitations</h2>
                <ul className="mt-3 space-y-2 text-xs text-fg-muted">
                  {m.limitations.map((l, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-warning" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}

          <section className="border border-border rounded-lg bg-bg-card p-5">
            <h2 className="text-sm font-medium text-fg">Confidence layer</h2>
            <p className="mt-2 text-xs text-fg-muted leading-relaxed">
              Every metric we compute carries a confidence score (0–100)
              derived from sample size, data recency, source diversity, and
              historical consistency. When confidence falls below 50%, the
              platform displays a visible warning on every figure derived from
              that snapshot. See{' '}
              <Link href="/methodology" className="text-accent hover:underline">
                methodology
              </Link>{' '}
              for the exact formula.
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}
