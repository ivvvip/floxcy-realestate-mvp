import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { BookOpen, Database, RefreshCw, ShieldAlert } from 'lucide-react';
import { getMethodology } from '@/lib/api';
import type { Methodology } from '@/lib/types';

export const metadata = {
  title: 'Methodology',
  description: 'How Floxcy calculates yields, ROI, area rankings, confidence scores, and undervaluation.',
};

export const revalidate = 3600;

export default async function MethodologyPage() {
  let m: Methodology | null = null;
  try {
    m = await getMethodology();
  } catch {
    m = null;
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Methodology' }]} />
            <div className="mt-2 flex items-center gap-2">
              <BookOpen className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                Methodology
              </h1>
              {m && <span className="pill tabular">{m.version}</span>}
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-3xl">
              The full derivation behind every number you see on Floxcy: data
              sources, formulas, update cadence, limitations, and disclaimer.
              We publish this in machine-readable form at{' '}
              <code className="text-fg">/api/v1/methodology</code>.
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 max-w-4xl">
          {!m ? (
            <div className="border border-negative/30 bg-negative/10 rounded-md px-3 py-2 text-sm text-negative">
              Could not load methodology document.
            </div>
          ) : (
            <article className="space-y-8">
              <section className="border border-border rounded-lg bg-bg-card p-5">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                  Disclaimer
                </div>
                <p className="mt-2 text-sm text-fg-muted leading-relaxed">
                  {m.disclaimer}
                </p>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <Database className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  Data sources
                </h2>
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-px bg-border border border-border rounded-lg overflow-hidden">
                  {Object.entries(m.data_sources).map(([k, v]) => (
                    <div key={k} className="bg-bg-card p-4">
                      <div className="text-sm font-medium text-fg">{v.name}</div>
                      <div className="mt-0.5 text-[11px] text-fg-subtle">
                        {v.type} · refresh {v.frequency}
                      </div>
                      {v.url && (
                        <a
                          href={v.url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-[11px] text-accent hover:underline"
                        >
                          source link
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-fg">How metrics are calculated</h2>
                <div className="mt-3 overflow-x-auto scrollbar-thin">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Metric</th>
                        <th>Formula</th>
                        <th>Unit</th>
                        <th>Notes</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(m.metrics).map(([k, v]) => (
                        <tr key={k}>
                          <td className="font-medium text-fg">{k}</td>
                          <td>
                            <code className="font-mono text-xs text-fg-muted">
                              {v.formula}
                            </code>
                          </td>
                          <td className="text-fg-muted text-[11px]">{v.unit ?? '—'}</td>
                          <td className="text-fg-muted text-[11px]">{v.notes ?? '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-fg">How scores are derived</h2>
                <div className="mt-3 space-y-3">
                  {Object.entries(m.scoring).map(([k, v]) => (
                    <div
                      key={k}
                      className="border border-border rounded-lg bg-bg-card p-4"
                    >
                      <div className="font-medium text-fg">{k}</div>
                      <code className="mt-2 block font-mono text-xs text-fg-muted whitespace-pre-wrap">
                        {v.formula}
                      </code>
                      {v.tiers && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(v.tiers).map(([t, label]) => (
                            <span key={t} className="pill tabular">
                              {t}: {label}
                            </span>
                          ))}
                        </div>
                      )}
                      {v.levels && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {Object.entries(v.levels).map(([l, label]) => (
                            <span key={l} className="pill tabular">
                              {l}: {label}
                            </span>
                          ))}
                        </div>
                      )}
                      {v.notes && (
                        <p className="mt-2 text-[11px] text-fg-subtle">{v.notes}</p>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  Update cadence
                </h2>
                <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  {Object.entries(m.update_cadence).map(([k, v]) => (
                    <div
                      key={k}
                      className="border border-border rounded-md bg-bg-card px-3 py-2"
                    >
                      <dt className="text-[11px] uppercase tracking-wide text-fg-subtle">
                        {k.replace(/_/g, ' ')}
                      </dt>
                      <dd className="mt-0.5 text-sm text-fg tabular">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>

              <section>
                <h2 className="text-lg font-semibold text-fg flex items-center gap-2">
                  <ShieldAlert className="h-4 w-4 text-warning" strokeWidth={2} />
                  Known limitations
                </h2>
                <ul className="mt-3 space-y-2 text-sm text-fg-muted">
                  {m.limitations.map((l, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="mt-1.5 h-1 w-1 flex-shrink-0 rounded-full bg-warning" />
                      <span>{l}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section className="border border-border rounded-lg bg-bg-card p-5">
                <p className="text-[11px] text-fg-subtle">
                  Methodology version <span className="tabular text-fg">{m.version}</span> ·
                  last updated <span className="tabular text-fg">{m.last_updated}</span>.
                  This page is generated from the live methodology document at{' '}
                  <code className="text-fg">/api/v1/methodology</code>; any change to the
                  formula is reflected here within one hour.
                </p>
              </section>
            </article>
          )}
        </div>
      </Container>
    </div>
  );
}
