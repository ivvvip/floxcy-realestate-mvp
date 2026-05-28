'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut, Plus } from 'lucide-react';
import type {
  Broker,
  Deal,
  DealCreate,
  InvestorLead,
  LeadStatus,
} from '@/lib/types';
import {
  brokerCreateOpportunity,
  brokerListMyLeads,
  brokerListMyOpportunities,
  brokerMe,
  brokerUpdateLead,
} from '@/lib/api';
import { clearBrokerToken, isBrokerAuthed } from '@/lib/brokerAuth';
import { formatAED, formatPercent } from '@/lib/format';

type Tab = 'opportunities' | 'leads' | 'submit';

const LEAD_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'viewing',
  'negotiating', 'closed', 'lost',
];

const STATUS_TONE: Record<string, string> = {
  draft: 'text-fg-muted',
  pending_review: 'text-accent',
  approved: 'text-positive',
  rejected: 'text-negative',
  archived: 'text-fg-subtle',
};

export function BrokerDashboardClient() {
  const router = useRouter();
  const [me, setMe] = useState<Broker | null>(null);
  const [tab, setTab] = useState<Tab>('opportunities');
  const [opps, setOpps] = useState<Deal[]>([]);
  const [leads, setLeads] = useState<InvestorLead[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isBrokerAuthed()) {
      router.replace('/broker/login');
      return;
    }
    (async () => {
      try {
        const [meRes, oppsRes, leadsRes] = await Promise.all([
          brokerMe(),
          brokerListMyOpportunities(),
          brokerListMyLeads(),
        ]);
        setMe(meRes);
        setOpps(oppsRes);
        setLeads(leadsRes);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load.');
        if (e instanceof Error && /401|403/.test(e.message)) {
          clearBrokerToken();
          router.replace('/broker/login');
        }
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  function logout() {
    clearBrokerToken();
    router.replace('/broker/login');
  }

  async function refreshOpps() {
    setOpps(await brokerListMyOpportunities());
  }

  async function refreshLeads() {
    setLeads(await brokerListMyLeads());
  }

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;
  if (!me) return null;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-sm text-fg-muted">
          Signed in as <span className="text-fg font-medium">{me.full_name}</span>
          {me.company_name && <> · {me.company_name}</>}
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-bg-card px-3 text-xs text-fg-muted hover:text-fg"
        >
          <LogOut className="h-3.5 w-3.5" strokeWidth={2} /> Logout
        </button>
      </div>

      <div className="flex items-center gap-1 border-b border-border">
        {(['opportunities', 'leads', 'submit'] as Tab[]).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={
              t === tab
                ? 'px-3 py-2 text-xs font-medium text-fg border-b-2 border-accent -mb-px'
                : 'px-3 py-2 text-xs font-medium text-fg-muted hover:text-fg'
            }
          >
            {t === 'opportunities' && `Opportunities (${opps.length})`}
            {t === 'leads' && `Leads (${leads.length})`}
            {t === 'submit' && 'Submit new'}
          </button>
        ))}
      </div>

      {tab === 'opportunities' && <OpportunitiesTable opps={opps} />}
      {tab === 'leads' && (
        <LeadsTable
          leads={leads}
          onChangeStatus={async (id, status) => {
            await brokerUpdateLead(id, { status });
            refreshLeads();
          }}
        />
      )}
      {tab === 'submit' && (
        <SubmitDealForm
          onCreated={async () => {
            await refreshOpps();
            setTab('opportunities');
          }}
        />
      )}
    </div>
  );
}

function OpportunitiesTable({ opps }: { opps: Deal[] }) {
  if (!opps.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
        You haven&apos;t submitted any opportunities yet.
      </div>
    );
  }
  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Title</th>
            <th>Area</th>
            <th className="text-right">Price</th>
            <th>Strategy</th>
            <th>Status</th>
            <th>Submitted</th>
          </tr>
        </thead>
        <tbody>
          {opps.map((o) => (
            <tr key={o.id}>
              <td className="text-fg">{o.title}</td>
              <td className="text-fg-muted">{o.area}</td>
              <td className="num">{formatAED(Number(o.price), { compact: true })}</td>
              <td className="text-fg-muted capitalize">{o.strategy_type}</td>
              <td className={STATUS_TONE[o.status] ?? 'text-fg-muted'}>
                {o.status}
              </td>
              <td className="text-fg-subtle text-[11px]">
                {new Date(o.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LeadsTable({
  leads,
  onChangeStatus,
}: {
  leads: InvestorLead[];
  onChangeStatus: (id: string, status: LeadStatus) => void;
}) {
  if (!leads.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
        No leads assigned yet.
      </div>
    );
  }
  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <table className="data-table">
        <thead>
          <tr>
            <th>Investor</th>
            <th>Contact</th>
            <th className="text-right">Budget</th>
            <th>Goal</th>
            <th>Status</th>
            <th>Created</th>
          </tr>
        </thead>
        <tbody>
          {leads.map((l) => (
            <tr key={l.id}>
              <td className="text-fg">{l.full_name}</td>
              <td className="text-fg-muted text-[11px]">
                {l.whatsapp && <div>WhatsApp: {l.whatsapp}</div>}
                {l.phone && <div>{l.phone}</div>}
                {l.email && <div>{l.email}</div>}
              </td>
              <td className="num">
                {l.budget != null ? formatAED(Number(l.budget), { compact: true }) : '—'}
              </td>
              <td className="text-fg-muted text-[11px]">
                {l.investment_goal ?? '—'}
              </td>
              <td>
                <select
                  value={l.status}
                  onChange={(e) =>
                    onChangeStatus(l.id, e.target.value as LeadStatus)
                  }
                  className="h-7 rounded border border-border bg-bg text-xs px-1.5"
                >
                  {LEAD_STATUSES.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </td>
              <td className="text-fg-subtle text-[11px]">
                {new Date(l.created_at).toLocaleDateString()}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const EMPTY_DEAL: DealCreate = {
  title: '',
  area: '',
  property_type: 'apartment',
  price: 0,
  expected_gross_yield: 0,
  strategy_type: 'balanced',
  risk_level: 'medium',
  confidence_score: 50,
  why_opportunity: '',
  risk_summary: '',
};

function SubmitDealForm({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState<DealCreate>(EMPTY_DEAL);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof DealCreate>(k: K, v: DealCreate[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await brokerCreateOpportunity(form);
      setForm(EMPTY_DEAL);
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="border border-border rounded-lg bg-bg-card p-5 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label="Title" required>
          <input
            type="text"
            required
            value={form.title}
            onChange={(e) => set('title', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Area" required>
          <input
            type="text"
            required
            value={form.area}
            onChange={(e) => set('area', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Property type" required>
          <input
            type="text"
            required
            value={form.property_type}
            onChange={(e) => set('property_type', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Unit type">
          <input
            type="text"
            value={form.unit_type ?? ''}
            onChange={(e) => set('unit_type', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Price (AED)" required>
          <input
            type="number"
            required
            min={1}
            value={form.price || ''}
            onChange={(e) => set('price', Number(e.target.value))}
            className="input-field"
          />
        </Field>
        <Field label="Price per sqft (AED)">
          <input
            type="number"
            min={0}
            value={form.price_per_sqft ?? ''}
            onChange={(e) =>
              set('price_per_sqft', e.target.value ? Number(e.target.value) : undefined)
            }
            className="input-field"
          />
        </Field>
        <Field label="Expected annual rent (AED)">
          <input
            type="number"
            min={0}
            value={form.expected_annual_rent ?? ''}
            onChange={(e) =>
              set('expected_annual_rent', e.target.value ? Number(e.target.value) : undefined)
            }
            className="input-field"
          />
        </Field>
        <Field label="Expected gross yield (%)" required>
          <input
            type="number"
            required
            step="0.01"
            min={0}
            max={50}
            value={form.expected_gross_yield || ''}
            onChange={(e) => set('expected_gross_yield', Number(e.target.value || 0))}
            className="input-field"
          />
        </Field>
        <Field label="Strategy" required>
          <select
            value={form.strategy_type ?? 'balanced'}
            onChange={(e) => set('strategy_type', e.target.value as DealCreate['strategy_type'])}
            className="input-field"
          >
            <option value="income">Income</option>
            <option value="growth">Growth</option>
            <option value="balanced">Balanced</option>
            <option value="luxury">Luxury</option>
            <option value="high-risk">High risk</option>
          </select>
        </Field>
        <Field label="Risk level" required>
          <select
            value={form.risk_level ?? 'medium'}
            onChange={(e) => set('risk_level', e.target.value as DealCreate['risk_level'])}
            className="input-field"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
        </Field>
        <Field label="Confidence score (0–100)" required>
          <input
            type="number"
            required
            min={0}
            max={100}
            value={form.confidence_score}
            onChange={(e) => set('confidence_score', Number(e.target.value || 0))}
            className="input-field"
          />
        </Field>
      </div>

      <Field label="Why this is an opportunity" required>
        <textarea
          required
          rows={4}
          value={form.why_opportunity}
          onChange={(e) => set('why_opportunity', e.target.value)}
          placeholder="Make the investment case. What makes this entry compelling?"
          className="input-field"
        />
      </Field>
      <Field label="Risks" required>
        <textarea
          required
          rows={3}
          value={form.risk_summary}
          onChange={(e) => set('risk_summary', e.target.value)}
          placeholder="Honest summary of the risks the investor should weigh."
          className="input-field"
        />
      </Field>
      <Field label="Best for">
        <textarea
          rows={2}
          value={form.best_for ?? ''}
          onChange={(e) => set('best_for', e.target.value)}
          placeholder="What kind of investor would this fit?"
          className="input-field"
        />
      </Field>

      {error && <div className="text-xs text-negative">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent text-bg text-sm font-medium px-5 hover:bg-accent/90 disabled:opacity-60"
      >
        <Plus className="h-3.5 w-3.5" strokeWidth={2} />
        {loading ? 'Submitting…' : 'Submit for review'}
      </button>
      <p className="text-[11px] text-fg-subtle">
        Submitted opportunities land in <em>pending review</em>. They become
        public only after admin approves them.
      </p>
    </form>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs text-fg-muted">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
