'use client';

import { useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import type { Deal, LeadCreate } from '@/lib/types';
import { formatAED, formatPercent } from '@/lib/format';
import { cn } from '@/lib/cn';
import { requestDealConsultation } from '@/lib/api';

const RISK_TONE: Record<string, string> = {
  low: 'text-positive',
  medium: 'text-fg-muted',
  high: 'text-negative',
};

function scoreTone(score: number | null): string {
  if (score == null) return 'text-fg-muted';
  if (score >= 75) return 'text-positive';
  if (score >= 60) return 'text-accent';
  if (score >= 45) return 'text-fg-muted';
  return 'text-negative';
}

export function DealDetailClient({ deal }: { deal: Deal }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-5">
        <div className="border border-border rounded-lg bg-bg-card p-5 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="pill pill-accent inline-flex items-center gap-1">
              <ShieldCheck className="h-3 w-3" strokeWidth={2} />
              Curated Investment Case
            </span>
            <span className="pill capitalize">{deal.strategy_type}</span>
            <span className={cn('pill capitalize', RISK_TONE[deal.risk_level])}>
              {deal.risk_level} risk
            </span>
          </div>

          <h1 className="text-2xl font-semibold text-fg leading-tight tracking-tight">
            {deal.title}
          </h1>
          <div className="text-sm text-fg-muted">
            {deal.area} · {deal.emirate} · {deal.property_type}
            {deal.unit_type ? ` · ${deal.unit_type}` : ''}
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat label="Price" value={formatAED(deal.price)} />
          <Stat
            label="Expected gross yield"
            value={
              deal.expected_gross_yield != null
                ? formatPercent(deal.expected_gross_yield, 2)
                : '—'
            }
          />
          <Stat
            label="Expected annual rent"
            value={
              deal.expected_annual_rent != null
                ? formatAED(Number(deal.expected_annual_rent), { compact: true })
                : '—'
            }
          />
          <Stat
            label="Opportunity score"
            value={
              <span className={cn('tabular', scoreTone(deal.opportunity_score))}>
                {deal.opportunity_score != null
                  ? deal.opportunity_score.toFixed(0)
                  : '—'}
              </span>
            }
          />
        </div>

        <Section title="Investment thesis" icon={<TrendingUp className="h-4 w-4" strokeWidth={2} />}>
          <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">
            {deal.why_opportunity || 'No thesis provided.'}
          </p>
        </Section>

        <Section title="Risks" icon={<ShieldCheck className="h-4 w-4" strokeWidth={2} />}>
          <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">
            {deal.risk_summary || 'No risk summary provided.'}
          </p>
        </Section>

        {deal.best_for && (
          <Section title="Best for">
            <p className="text-sm text-fg-muted leading-relaxed whitespace-pre-line">
              {deal.best_for}
            </p>
          </Section>
        )}
      </div>

      <div className="space-y-4">
        {deal.broker && (
          <div className="border border-border rounded-lg bg-bg-card p-4 space-y-2">
            <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Verified specialist
            </div>
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-bg-elev flex items-center justify-center">
                <Building2 className="h-5 w-5 text-fg-muted" strokeWidth={2} />
              </div>
              <div className="text-sm">
                <div className="font-medium text-fg">{deal.broker.full_name}</div>
                {deal.broker.company_name && (
                  <div className="text-xs text-fg-muted">{deal.broker.company_name}</div>
                )}
              </div>
            </div>
          </div>
        )}

        <ConsultationForm dealId={deal.id} />
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="border border-border rounded-lg bg-bg-card p-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div className="mt-1 text-sm font-medium text-fg">{value}</div>
    </div>
  );
}

function Section({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="border border-border rounded-lg bg-bg-card p-5 space-y-2">
      <div className="flex items-center gap-2 text-fg">
        {icon}
        <h2 className="text-sm font-medium tracking-tight">{title}</h2>
      </div>
      {children}
    </div>
  );
}

function ConsultationForm({ dealId }: { dealId: string }) {
  const [form, setForm] = useState<LeadCreate>({ full_name: '' });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof LeadCreate>(k: K, v: LeadCreate[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await requestDealConsultation(dealId, form);
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="border border-positive/30 bg-positive/10 rounded-lg p-4 text-sm text-positive flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 mt-0.5 flex-shrink-0" strokeWidth={2} />
        <span>{success}</span>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="border border-border rounded-lg bg-bg-card p-4 space-y-3">
      <div className="flex items-center gap-2 text-fg">
        <MessageCircle className="h-4 w-4" strokeWidth={2} />
        <h3 className="text-sm font-medium">Request a consultation</h3>
      </div>
      <Field label="Full name" required>
        <input
          type="text"
          required
          value={form.full_name}
          onChange={(e) => set('full_name', e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="WhatsApp">
        <input
          type="tel"
          value={form.whatsapp ?? ''}
          onChange={(e) => set('whatsapp', e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Email">
        <input
          type="email"
          value={form.email ?? ''}
          onChange={(e) => set('email', e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Budget (AED)">
        <input
          type="number"
          min={0}
          value={form.budget ?? ''}
          onChange={(e) => set('budget', e.target.value ? Number(e.target.value) : undefined)}
          className="input-field"
        />
      </Field>
      <Field label="Investment goal">
        <input
          type="text"
          placeholder="income / growth / balanced"
          value={form.investment_goal ?? ''}
          onChange={(e) => set('investment_goal', e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Timeline">
        <input
          type="text"
          placeholder="e.g. within 3 months"
          value={form.timeline ?? ''}
          onChange={(e) => set('timeline', e.target.value)}
          className="input-field"
        />
      </Field>
      <Field label="Message">
        <textarea
          rows={3}
          value={form.message ?? ''}
          onChange={(e) => set('message', e.target.value)}
          className="input-field"
        />
      </Field>
      {error && <div className="text-[11px] text-negative">{error}</div>}
      <button
        type="submit"
        disabled={loading || !form.full_name}
        className="inline-flex w-full h-9 items-center justify-center gap-1.5 rounded-md bg-accent text-bg text-sm font-medium hover:bg-accent/90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
        {loading ? 'Sending…' : 'Request Consultation'}
      </button>
      <p className="text-[10px] text-fg-subtle leading-relaxed">
        A verified investment specialist will contact you. We do not share
        your details with third parties.
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
      <span className="text-[11px] text-fg-muted">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
