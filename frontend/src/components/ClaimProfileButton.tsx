'use client';

import { useState } from 'react';
import { BadgeCheck, X, Check } from 'lucide-react';
import { submitClaim } from '@/lib/api';
import type { ClaimType } from '@/lib/types';

interface Props {
  claimType: ClaimType;
  targetId: string;
  targetName?: string | null;
  /** Visual size of the trigger. */
  variant?: 'button' | 'link';
  label?: string;
}

/**
 * "Claim this profile" flow (PART 7). Functional, NO payment — submits a
 * verification request that an admin approves in /admin/claims. The payment
 * gate comes later.
 */
export function ClaimProfileButton({ claimType, targetId, targetName, variant = 'button', label }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [company, setCompany] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const text = label ?? `Claim this ${claimType}`;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim() || (!email.trim() && !phone.trim())) {
      setError('Add your name and at least one contact (email or phone).');
      return;
    }
    setSubmitting(true);
    try {
      await submitClaim({
        claim_type: claimType,
        target_id: targetId,
        target_name: targetName ?? null,
        claimant_name: name.trim(),
        claimant_email: email.trim() || null,
        claimant_phone: phone.trim() || null,
        claimant_company: company.trim() || null,
        message: message.trim() || null,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not submit claim.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      {variant === 'link' ? (
        <button onClick={() => setOpen(true)} className="inline-flex items-center gap-1 text-[11px] text-accent hover:underline">
          <BadgeCheck className="h-3 w-3" strokeWidth={2.5} /> {text}
        </button>
      ) : (
        <button
          onClick={() => setOpen(true)}
          className="inline-flex items-center gap-1.5 rounded-md border border-accent/40 bg-accent/5 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/10 transition-colors"
        >
          <BadgeCheck className="h-3.5 w-3.5" strokeWidth={2.5} /> {text}
        </button>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={() => setOpen(false)}>
          <div className="w-full max-w-md surface-card p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-fg inline-flex items-center gap-1.5">
                  <BadgeCheck className="h-4 w-4 text-accent" strokeWidth={2.5} /> {text}
                </h3>
                <p className="mt-1 text-[11px] text-fg-muted">
                  {targetName ?? targetId} · we&apos;ll verify and get back to you within 2 business days. No payment now.
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="text-fg-subtle hover:text-fg"><X className="h-4 w-4" /></button>
            </div>

            {done ? (
              <div className="mt-5 text-center">
                <div className="mx-auto w-10 h-10 rounded-full border border-positive/40 inline-flex items-center justify-center">
                  <Check className="h-5 w-5 text-positive" strokeWidth={2.5} />
                </div>
                <p className="mt-3 text-sm text-fg">Claim submitted</p>
                <p className="mt-1 text-xs text-fg-muted">Our team will verify your request and reach out.</p>
                <button onClick={() => setOpen(false)} className="mt-4 text-xs text-accent hover:underline">Close</button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <Field label="Your name *"><input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} /></Field>
                <Field label="Email"><input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} /></Field>
                <Field label="Phone / WhatsApp"><input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+971 50 …" /></Field>
                <Field label="Company (optional)"><input value={company} onChange={(e) => setCompany(e.target.value)} className={inputCls} /></Field>
                <Field label="Anything we should know? (optional)">
                  <textarea rows={2} value={message} onChange={(e) => setMessage(e.target.value)} className={inputCls} />
                </Field>
                {error && <div className="text-[11px] text-negative">{error}</div>}
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-bg px-3 py-2 text-xs font-semibold hover:bg-accent/90 disabled:opacity-60"
                >
                  {submitting ? 'Submitting…' : 'Submit claim'}
                </button>
                <p className="text-[10px] text-fg-subtle">Verification only — no payment is taken at this step.</p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}

const inputCls =
  'w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60';

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-[11px] text-fg-muted">{label}</span>
      <div className="mt-0.5">{children}</div>
    </label>
  );
}
