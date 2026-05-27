import Link from 'next/link';
import { Container } from '@/components/Container';
import { PriceTrend } from '@/components/charts/PriceTrend';
import { YieldBar } from '@/components/charts/YieldBar';
import { getDashboardSummary } from '@/lib/api';
import { formatAED, formatPercent, formatNumber } from '@/lib/format';
import type { DashboardSummary } from '@/lib/types';

export const revalidate = 300;
export const metadata = {
  title: 'Market Dashboard · Floxcy',
  description: 'Live KPIs and trends across all tracked Dubai areas.',
};

async function loadSummary(): Promise<DashboardSummary | null> {
  try {
    return await getDashboardSummary();
  } catch {
    return null;
  }
}

function KPI({
  label,
  value,
  hint,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="surface-card p-5">
      <div className="text-xs font-medium uppercase tracking-wide text-fg-subtle">
        {label}
      </div>
      <div className="mt-2 text-3xl font-semibold tracking-tight text-fg">
        {value}
      </div>
      {hint && <div className="mt-1 text-xs text-fg-muted">{hint}</div>}
    </div>
  );
}

export default async function DashboardPage() {
  const summary = await loadSummary();

  if (!summary) {
    return (
      <section className="py-16">
        <Container>
          <div className="surface-card p-8 text-center">
            <h1 className="text-2xl font-semibold text-fg">Dashboard unavailable</h1>
            <p className="mt-2 text-fg-muted">
              We couldn&apos;t reach the market API. Please try again shortly.
            </p>
          </div>
        </Container>
      </section>
    );
  }

  const trendData = summary.price_trend.map((p) => ({
    label: p.month,
    price: p.avg_price_per_sqft,
    yield: p.avg_yield,
  }));

  const yieldData = summary.top_areas.map((a) => ({
    name: a.name,
    value: a.rental_yield,
  }));

  return (
    <section className="py-12">
      <Container>
        <header className="mb-8">
          <span className="pill pill-accent">Market overview</span>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">
            Dubai Real Estate Dashboard
          </h1>
          <p className="mt-2 max-w-2xl text-fg-muted">
            Real-time aggregates across {summary.total_areas} investment-grade
            areas, sourced from our market data layer.
          </p>
        </header>

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KPI
            label="Tracked Areas"
            value={summary.total_areas}
            hint="Investment-grade neighborhoods"
          />
          <KPI
            label="Avg Rental Yield"
            value={formatPercent(summary.avg_yield)}
            hint="Across latest snapshots"
          />
          <KPI
            label="Avg Price / sqft"
            value={`AED ${formatNumber(summary.avg_price_per_sqft)}`}
            hint="Market median"
          />
          <KPI
            label="12mo Transactions"
            value={formatNumber(summary.total_transaction_volume)}
            hint="Cumulative volume"
          />
        </div>

        {summary.top_performer && (
          <div className="surface-card mt-6 flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <span className="pill pill-accent">Top performer</span>
              <h3 className="mt-2 text-xl font-semibold text-fg">
                {summary.top_performer.name}
              </h3>
              <p className="text-sm text-fg-muted">
                Yield {formatPercent(summary.top_performer.rental_yield)} · 1y
                appreciation{' '}
                {formatPercent(summary.top_performer.appreciation_1y ?? 0)} ·
                Investment score{' '}
                {summary.top_performer.investment_score?.toFixed(1) ?? '—'}/10
              </p>
            </div>
            <Link
              href={`/areas/${summary.top_performer.id}`}
              className="inline-flex h-10 items-center rounded-xl bg-accent px-4 text-sm font-medium text-accent-fg shadow-glow hover:bg-accent/90"
            >
              View area
            </Link>
          </div>
        )}

        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          <div className="surface-card p-5">
            <h3 className="text-sm font-medium text-fg-muted">
              Market price & yield trend (12mo)
            </h3>
            <div className="mt-4">
              <PriceTrend data={trendData} />
            </div>
          </div>
          <div className="surface-card p-5">
            <h3 className="text-sm font-medium text-fg-muted">
              Top 5 areas by yield
            </h3>
            <div className="mt-4">
              <YieldBar data={yieldData} />
            </div>
          </div>
        </div>

        <div className="surface-card mt-6 overflow-hidden">
          <div className="border-b border-border p-5">
            <h3 className="text-sm font-medium text-fg-muted">
              Top 5 investment areas
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-bg-elev/40 text-left text-xs uppercase tracking-wide text-fg-subtle">
                <tr>
                  <th className="px-5 py-3 font-medium">#</th>
                  <th className="px-5 py-3 font-medium">Area</th>
                  <th className="px-5 py-3 font-medium">Type</th>
                  <th className="px-5 py-3 font-medium text-right">Price/sqft</th>
                  <th className="px-5 py-3 font-medium text-right">Yield</th>
                  <th className="px-5 py-3 font-medium text-right">1y App.</th>
                  <th className="px-5 py-3 font-medium text-right">Score</th>
                </tr>
              </thead>
              <tbody>
                {summary.top_areas.map((a, i) => (
                  <tr
                    key={a.id}
                    className="border-t border-border hover:bg-bg-elev/30"
                  >
                    <td className="px-5 py-3 text-fg-subtle">{i + 1}</td>
                    <td className="px-5 py-3">
                      <Link
                        href={`/areas/${a.id}`}
                        className="font-medium text-fg hover:text-accent"
                      >
                        {a.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 capitalize text-fg-muted">
                      {a.area_type}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-fg">
                      {formatAED(a.avg_price_per_sqft)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-accent">
                      {formatPercent(a.rental_yield)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-fg">
                      {formatPercent(a.appreciation_1y ?? 0)}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-fg">
                      {a.investment_score?.toFixed(1) ?? '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Container>
    </section>
  );
}
