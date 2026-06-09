'use client';

import { useState } from 'react';
import { usePathname } from 'next/navigation';
import { MessageSquare, X, Star, Check } from 'lucide-react';
import { submitFeedback } from '@/lib/api';

/**
 * Floating "How useful was this page?" widget — bottom-right, all pages.
 * Posts a star rating + free-text + optional email to /api/v1/feedback.
 */
export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [lookingFor, setLookingFor] = useState('');
  const [missing, setMissing] = useState('');
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Hide on admin pages — staff don't need to rate their own dashboard.
  if (pathname?.startsWith('/admin') || pathname?.startsWith('/broker/')) return null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!rating && !lookingFor.trim() && !missing.trim()) {
      setError('Add a rating or a quick note so we know what to improve.');
      return;
    }
    setSubmitting(true);
    try {
      await submitFeedback({
        page_url: pathname || (typeof window !== 'undefined' ? window.location.pathname : null),
        rating: rating || null,
        looking_for: lookingFor.trim() || null,
        missing: missing.trim() || null,
        email: email.trim() || null,
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send feedback.');
    } finally {
      setSubmitting(false);
    }
  }

  function reset() {
    setOpen(false);
    setTimeout(() => {
      setDone(false); setRating(0); setHover(0); setLookingFor(''); setMissing(''); setEmail(''); setError(null);
    }, 200);
  }

  return (
    <>
      {!open && (
        <button
          onClick={() => setOpen(true)}
          aria-label="Give feedback"
          className="fixed bottom-4 right-4 z-40 inline-flex items-center gap-1.5 rounded-full border border-border bg-bg-card/95 backdrop-blur px-3.5 py-2.5 text-xs font-medium text-fg shadow-lg hover:border-accent/50 hover:text-accent transition-colors"
        >
          <MessageSquare className="h-4 w-4" strokeWidth={2} />
          <span className="hidden sm:inline">Feedback</span>
        </button>
      )}

      {open && (
        <div className="fixed bottom-4 right-4 z-50 w-[calc(100vw-2rem)] sm:w-80 surface-card p-4 shadow-2xl">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-sm font-semibold text-fg">How useful was this page?</h3>
            <button onClick={reset} aria-label="Close" className="text-fg-subtle hover:text-fg"><X className="h-4 w-4" /></button>
          </div>

          {done ? (
            <div className="mt-4 text-center py-3">
              <div className="mx-auto w-10 h-10 rounded-full border border-positive/40 inline-flex items-center justify-center">
                <Check className="h-5 w-5 text-positive" strokeWidth={2.5} />
              </div>
              <p className="mt-2 text-sm text-fg">Thank you!</p>
              <p className="mt-0.5 text-xs text-fg-muted">Your feedback helps us improve Floxcy.</p>
              <button onClick={reset} className="mt-3 text-xs text-accent hover:underline">Close</button>
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-3 space-y-3">
              <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} star${n > 1 ? 's' : ''}`}
                    onClick={() => setRating(n)}
                    onMouseEnter={() => setHover(n)}
                    onMouseLeave={() => setHover(0)}
                    className="p-0.5"
                  >
                    <Star
                      className={`h-6 w-6 transition-colors ${(hover || rating) >= n ? 'text-accent fill-accent' : 'text-fg-subtle'}`}
                      strokeWidth={2}
                    />
                  </button>
                ))}
              </div>

              <label className="block">
                <span className="text-[11px] text-fg-muted">What were you looking for?</span>
                <textarea
                  rows={2} value={lookingFor} onChange={(e) => setLookingFor(e.target.value)}
                  className={inputCls} placeholder="e.g. yields for a 1-bed in JVC"
                />
              </label>

              <label className="block">
                <span className="text-[11px] text-fg-muted">What&apos;s missing or confusing?</span>
                <textarea
                  rows={2} value={missing} onChange={(e) => setMissing(e.target.value)}
                  className={inputCls} placeholder="Anything we should add or fix"
                />
              </label>

              <label className="block">
                <span className="text-[11px] text-fg-muted">Email (optional — if you want a reply)</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} />
              </label>

              {error && <div className="text-[11px] text-negative">{error}</div>}

              <button
                type="submit" disabled={submitting}
                className="w-full inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-bg px-3 py-2 text-xs font-semibold hover:bg-accent/90 disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send feedback'}
              </button>
            </form>
          )}
        </div>
      )}
    </>
  );
}

const inputCls =
  'mt-0.5 w-full bg-bg-elev/60 border border-border rounded-md px-2.5 py-1.5 text-xs text-fg placeholder:text-fg-subtle focus:outline-none focus:border-accent/60';
