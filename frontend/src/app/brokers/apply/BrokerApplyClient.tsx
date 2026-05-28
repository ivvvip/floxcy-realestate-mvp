'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import type { BrokerApplicationCreate } from '@/lib/types';
import { applyAsBroker } from '@/lib/api';

const EMPTY: BrokerApplicationCreate = {
  full_name: '',
  email: '',
};

export function BrokerApplyClient() {
  const [form, setForm] = useState<BrokerApplicationCreate>(EMPTY);
  const [specialistInput, setSpecialistInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof BrokerApplicationCreate>(
    k: K,
    v: BrokerApplicationCreate[K]
  ) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const specialist_areas = specialistInput
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      await applyAsBroker({
        ...form,
        specialist_areas: specialist_areas.length ? specialist_areas : undefined,
      });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Submission failed.');
    } finally {
      setLoading(false);
    }
  }

  if (success) {
    return (
      <div className="max-w-2xl border border-positive/30 bg-positive/10 rounded-lg p-6 space-y-2">
        <div className="flex items-center gap-2 text-positive">
          <CheckCircle2 className="h-5 w-5" strokeWidth={2} />
          <h2 className="text-base font-medium">Application received</h2>
        </div>
        <p className="text-sm text-fg-muted">
          Thank you — your application is in the review queue. We&apos;ll be in
          touch within a few business days. If approved, you&apos;ll receive
          a login link and onboarding instructions.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={submit}
      className="max-w-2xl border border-border rounded-lg bg-bg-card p-6 space-y-4"
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
        <Field label="Company">
          <input
            type="text"
            value={form.company_name ?? ''}
            onChange={(e) => set('company_name', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Email" required>
          <input
            type="email"
            required
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
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
        <Field label="Phone">
          <input
            type="tel"
            value={form.phone ?? ''}
            onChange={(e) => set('phone', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="RERA license">
          <input
            type="text"
            value={form.rera_license ?? ''}
            onChange={(e) => set('rera_license', e.target.value)}
            className="input-field"
          />
        </Field>
        <Field label="Years of experience">
          <input
            type="number"
            min={0}
            max={80}
            value={form.experience_years ?? ''}
            onChange={(e) =>
              set(
                'experience_years',
                e.target.value ? Number(e.target.value) : undefined
              )
            }
            className="input-field"
          />
        </Field>
        <Field label="Specialist areas (comma-separated)">
          <input
            type="text"
            placeholder="Dubai Marina, Palm Jumeirah"
            value={specialistInput}
            onChange={(e) => setSpecialistInput(e.target.value)}
            className="input-field"
          />
        </Field>
      </div>

      <Field label="Why Floxcy">
        <textarea
          rows={4}
          value={form.message ?? ''}
          onChange={(e) => set('message', e.target.value)}
          placeholder="Tell us about your specialty, typical clients, and the kinds of opportunities you can bring."
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
        disabled={loading || !form.full_name || !form.email}
        className="inline-flex h-10 items-center justify-center gap-1.5 rounded-md bg-accent text-bg text-sm font-medium px-5 hover:bg-accent/90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
        {loading ? 'Submitting…' : 'Submit Application'}
      </button>
      <p className="text-[11px] text-fg-subtle">
        We review every application. Approved specialists get a dashboard
        to submit and manage curated investment opportunities for our investor
        base.
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
