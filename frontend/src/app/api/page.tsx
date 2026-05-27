import Link from 'next/link';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Terminal, KeyRound, Zap, Globe } from 'lucide-react';

export const metadata = {
  title: 'Public API',
  description: 'Floxcy public API endpoints, authentication, rate limits, and example responses.',
};

const ENDPOINTS: { verb: string; path: string; desc: string }[] = [
  { verb: 'GET', path: '/api/v1/areas', desc: 'List tracked areas with latest metrics' },
  { verb: 'GET', path: '/api/v1/areas/{id}', desc: 'Detailed area data with 12-month history' },
  { verb: 'GET', path: '/api/v1/areas/{id}/confidence', desc: 'Data confidence breakdown for an area' },
  { verb: 'GET', path: '/api/v1/areas/stats', desc: 'Aggregate statistics across all areas' },
  { verb: 'GET', path: '/api/v1/areas/compare', desc: 'Multi-area comparison (ids=a,b,c)' },
  { verb: 'POST', path: '/api/v1/roi/calculate', desc: 'ROI calculator (yield, payback)' },
  { verb: 'GET', path: '/api/v1/dashboard/summary', desc: 'Aggregated market dashboard data' },
  { verb: 'POST', path: '/api/v1/advisor/query', desc: 'AI investment analyst ranked recommendations' },
  { verb: 'GET', path: '/api/v1/opportunities', desc: 'Undervalued Area Detector results' },
  { verb: 'GET', path: '/api/v1/rankings', desc: 'Area rankings by yield / appreciation / volume / risk / score' },
  { verb: 'GET', path: '/api/v1/alerts', desc: 'List investor alerts (cookie or user-bound)' },
  { verb: 'POST', path: '/api/v1/alerts', desc: 'Create an investor alert' },
  { verb: 'GET', path: '/api/v1/methodology', desc: 'Machine-readable methodology document' },
];

const EXAMPLE = `{
  "area_id": "0e36707a-f98e-4402-8f83-abac6bd68637",
  "area_name": "Jumeirah Village Circle",
  "score": 82,
  "tier": "strong",
  "headline": "JVC screens as a strong opportunity",
  "reasons": [
    "Rental yield 7.85% sits +1.4pp above the UAE cohort median.",
    "AED/sqft trades at a 18% discount to cohort median pricing."
  ],
  "risks": [
    "High supply pipeline may compress near-term rental growth."
  ],
  "best_for": [
    "Rental-income investors with medium risk tolerance"
  ],
  "confidence": {
    "score": 82,
    "level": "high",
    "sources": ["Dubai Land Department transactions", "REIDIN price indices"],
    "last_updated": "2026-05-28T10:00:00Z",
    "sample_size": 1248,
    "data_delay_minutes": 12
  }
}`;

export default function ApiPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Public API' }]} />
            <div className="mt-2 flex items-center gap-2">
              <Terminal className="h-4 w-4 text-fg-muted" strokeWidth={2} />
              <h1 className="text-xl font-semibold text-fg tracking-tight">
                Public API
              </h1>
              <span className="pill pill-accent">v1</span>
            </div>
            <p className="mt-1 text-xs text-fg-muted max-w-2xl">
              Floxcy exposes its market intelligence as a JSON API. Free tier
              for evaluation; paid tiers for production usage.{' '}
              <Link href="/pricing" className="text-accent hover:underline">
                Pricing
              </Link>
              .
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 max-w-4xl space-y-6">
          <section className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border border border-border rounded-lg overflow-hidden">
            <Cell
              icon={Globe}
              label="Base URL"
              value={<code className="font-mono text-xs">https://api.floxcy.com</code>}
            />
            <Cell
              icon={KeyRound}
              label="Auth"
              value={<code className="font-mono text-xs">X-API-Key: fxc_live_...</code>}
            />
            <Cell
              icon={Zap}
              label="Rate limit"
              value={
                <span className="text-xs text-fg-muted tabular">
                  60/min anon · 600/min pro · 2000/min api
                </span>
              }
            />
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg">Endpoints</h2>
            <div className="mt-3 border border-border rounded-lg overflow-hidden bg-bg-card">
              <div className="overflow-x-auto scrollbar-thin">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Verb</th>
                      <th>Path</th>
                      <th>Description</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ENDPOINTS.map((e) => (
                      <tr key={e.path}>
                        <td>
                          <span
                            className={`pill ${
                              e.verb === 'POST'
                                ? 'pill-accent'
                                : 'pill-positive'
                            }`}
                          >
                            {e.verb}
                          </span>
                        </td>
                        <td>
                          <code className="font-mono text-xs text-fg">{e.path}</code>
                        </td>
                        <td className="text-xs text-fg-muted">{e.desc}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>

          <section>
            <h2 className="text-lg font-semibold text-fg">Example response</h2>
            <p className="mt-1.5 text-xs text-fg-muted">
              <code className="font-mono">GET /api/v1/opportunities</code> · single result entry
            </p>
            <pre className="mt-3 border border-border rounded-lg bg-bg-card p-4 overflow-x-auto scrollbar-thin text-[11px] font-mono text-fg-muted whitespace-pre">
              {EXAMPLE}
            </pre>
          </section>

          <section className="border border-border rounded-lg bg-bg-card p-5">
            <h2 className="text-sm font-medium text-fg">Getting an API key</h2>
            <p className="mt-2 text-xs text-fg-muted">
              For the public beta, request an API key by reaching out via the
              channel in{' '}
              <Link href="/about" className="text-accent hover:underline">
                About
              </Link>
              . Admin operators provision keys per tier from the admin
              dashboard.
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}

function Cell({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Globe;
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="bg-bg-card p-4">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 text-fg-muted" strokeWidth={2} />
        <span className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
          {label}
        </span>
      </div>
      <div className="mt-1.5">{value}</div>
    </div>
  );
}
