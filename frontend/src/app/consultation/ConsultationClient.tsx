'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { LeadCreate } from '@/lib/types';
import { requestConsultation } from '@/lib/api';

export function ConsultationClient() {
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
      const res = await requestConsultation(form);
      setSuccess(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="border border-positive/30 bg-positive/10 rounded-lg p-6 flex items-start gap-3 text-sm">
        <CheckCircle2 className="h-5 w-5 text-positive mt-0.5" strokeWidth={2} />
        <div>
          <h2 className="font-medium text-positive">Request received</h2>
          <p className="mt-1 text-fg-muted">{success}</p>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg bg-bg-card p-6 space-y-4"
    >
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
        <Field label="Phone">
          <input
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Budget (AED)">
          <input
            type="number"
            min={0}
            value={form.budget ?? ''}
            onChange={(e) =>
              set('budget', e.target.value ? Number(e.target.value) : undefined)
            }
            className="input-field"
          />
        </Field>
        <Field label="Preferred area">
          <input
            type="text"
            value={form.preferred_area ?? ''}
            onChange={(e) => set('preferred_area', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Investment goal">
          <select
            value={form.investment_goal ?? ''}
            onChange={(e) => set('investment_goal', e.target.value || undefined)}
            className="input-field"
          >
            <option value="">—</option>
            <option value="income">Income</option>
            <option value="growth">Growth</option>
            <option value="balanced">Balanced</option>
            <option value="luxury">Luxury</option>
          </select>
        </Field>
        <Field label="Risk tolerance">
          <select
            value={form.risk_level ?? ''}
            onChange={(e) => set('risk_level', (e.target.value || undefined) as LeadCreate['risk_level'])}
            className="input-field"
          >
            <option value="">—</option>
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
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
      </div>

      <Field label="Anything else we should know?">
        <textarea
          rows={4}
          value={form.message ?? ''}
          onChange={(e) => set('message', e.target.value)}
          className="input-field"
        />
      </Field>

      {error && (
        <div className="text-xs text-negative border border-negative/30 bg-negative/10 rounded-md px-3 py-2">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={loading || !form.full_name}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent text-bg text-sm font-medium px-5 hover:bg-accent/90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
        {loading ? 'Sending…' : 'Request Consultation'}
      </button>
      <p className="text-[11px] text-fg-subtle">
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
      <span className="text-xs text-fg-muted">
        {label}
        {required && <span className="text-accent"> *</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
