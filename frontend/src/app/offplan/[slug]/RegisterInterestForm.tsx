'use client';

import { useState } from 'react';
import { MessageCircle, Check } from 'lucide-react';
import { registerOffplanInterest } from '@/lib/api';

interface Props {
  projectSlug: string;
  projectName: string;
}

export function RegisterInterestForm({ projectSlug, projectName }: Props) {
  const [fullName, setFullName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [email, setEmail] = useState('');
  const [budget, setBudget] = useState('');
  const [timeline, setTimeline] = useState('3_to_6_months');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!fullName.trim() || (!whatsapp && !email)) {
      setError('Add your name and at least one contact (WhatsApp or email)');
      return;
    }
    setSubmitting(true);
    try {
      await registerOffplanInterest({
        project_slug: projectSlug,
        full_name: fullName.trim(),
        whatsapp: whatsapp.trim() || null,
        email: email.trim() || null,
        budget_aed: budget ? Number(budget) : null,
        timeline,
        message: message.trim() || null,
      });
      setSuccess(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to register interest');
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="surface-card p-5 text-center">
        <div className="mx-auto w-10 h-10 rounded-full border border-positive/40 inline-flex items-center justify-center">
          <Check className="h-5 w-5 text-positive" strokeWidth={2.5} />
        </div>
        <h3 className="mt-3 text-sm font-semibold text-fg">Interest registered</h3>
        <p className="mt-1 text-xs text-fg-muted">
          A Floxcy specialist will reach out within 24 hours about{' '}
          <span className="text-fg">{projectName}</span>.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="surface-card p-4 space-y-3 sticky top-4">
      <div>
        <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
          <MessageCircle className="h-3.5 w-3.5 text-accent" strokeWidth={2.5} />
          Register interest
        </h3>
        <p className="mt-1 text-[11px] text-fg-muted">
          We&apos;ll connect you with the right specialist for{' '}
          <span className="text-fg">{projectName}</span>.
        </p>
      </div>

      <Field label="Full name *">
        <input
          type="text"
          required
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
      </Field>

      <Field label="WhatsApp">
        <input
          type="tel"
          value={whatsapp}
          onChange={(e) => setWhatsapp(e.target.value)}
          placeholder="+971 50 …"
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
      </Field>

      <Field label="Email">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
      </Field>

      <Field label="Budget (AED)">
        <input
          type="number"
          min="0"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
          placeholder="1500000"
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        />
      </Field>

      <Field label="Timeline">
        <select
          value={timeline}
          onChange={(e) => setTimeline(e.target.value)}
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
        >
          <option value="immediate">Immediate</option>
          <option value="1_to_3_months">1–3 months</option>
          <option value="3_to_6_months">3–6 months</option>
          <option value="6_to_12_months">6–12 months</option>
          <option value="researching">Just researching</option>
        </select>
      </Field>

      <Field label="Notes (optional)">
        <textarea
          rows={2}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60"
          placeholder="Preferred unit type, view, financing…"
        />
      </Field>

      {error && (
        <div className="text-[11px] text-negative">{error}</div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-bg px-3 py-2 text-xs font-semibold hover:bg-accent/90 disabled:opacity-60"
      >
        {submitting ? 'Submitting…' : 'Register interest'}
      </button>

      <p className="text-[10px] text-fg-subtle">
        By submitting you agree to be contacted by a Floxcy specialist.
        We never share your data with third parties without consent.
      </p>
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-fg-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
