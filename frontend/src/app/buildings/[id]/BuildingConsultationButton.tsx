'use client';

import { useState } from 'react';
import { ArrowRight, Phone, X } from 'lucide-react';
import { brokerConsultation, brokerMatch } from '@/lib/api';
import type {
  BrokerConsultationRequestBody,
  BrokerMatchItem,
} from '@/lib/types';

interface Props {
  buildingProject: string;
  areaName: string | null;
}

/**
 * Tiny inline modal that:
 *  1) Calls /dld/broker-match (goal=buy, preferred_area_norm=area)
 *  2) Picks the top broker
 *  3) Submits a /dld/broker-consultation with a tagged message
 *
 * Keeps the building page light — no per-broker UI here. The user just
 * confirms with WhatsApp + name and we send.
 */
export function BuildingConsultationButton({ buildingProject, areaName }: Props) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [whatsapp, setWhatsapp] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'done' | 'error'>(
    'idle'
  );
  const [err, setErr] = useState<string | null>(null);
  const [matchedName, setMatchedName] = useState<string | null>(null);

  async function submit() {
    if (!name.trim() || name.trim().length < 2) {
      setErr('Please enter your full name.');
      return;
    }
    if (!whatsapp.trim() || whatsapp.trim().length < 4) {
      setErr('Please enter a valid WhatsApp number.');
      return;
    }
    setStatus('loading');
    setErr(null);
    try {
      // 1) Match a broker scoped to the area + buy goal.
      const matchRes = await brokerMatch({
        goal: 'buy',
        preferred_area_norm: areaName ? areaName.toLowerCase() : undefined,
        language: 'english',
      });
      const broker: BrokerMatchItem | undefined = matchRes.items[0];
      if (!broker) {
        setStatus('error');
        setErr(
          'No active broker available for this area right now. Try /brokers/directory for the full list.'
        );
        return;
      }
      setMatchedName(broker.full_name);

      // 2) Send the consultation with the building tag in the message.
      const payload: BrokerConsultationRequestBody = {
        broker_number: broker.broker_number,
        full_name: name.trim(),
        whatsapp: whatsapp.trim(),
        goal: 'buy',
        message: `[source=building_xray building="${buildingProject}" area="${areaName ?? ''}"] Interested in this specific building.`,
      };
      await brokerConsultation(payload);
      setStatus('done');
    } catch (e) {
      setStatus('error');
      setErr(e instanceof Error ? e.message : 'Could not send the request.');
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="btn-primary inline-flex items-center justify-center gap-1.5 h-10 px-4 text-xs"
      >
        Request consultation
        <ArrowRight className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>

      {open && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 bg-bg/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => status !== 'loading' && setOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md bg-bg-card border-t sm:border border-border rounded-t-lg sm:rounded-lg shadow-xl max-h-[92vh] overflow-y-auto"
          >
            <div className="sticky top-0 bg-bg-card border-b border-border px-4 py-3 flex items-center justify-between">
              <div className="min-w-0">
                <div className="text-sm font-semibold text-fg truncate">
                  Consult on {buildingProject}
                </div>
                <div className="text-[11px] text-fg-muted">
                  We&apos;ll match a verified broker.
                </div>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close"
                disabled={status === 'loading'}
                className="grid h-9 w-9 place-items-center rounded-md border border-border hover:bg-bg-elev disabled:opacity-40"
              >
                <X className="h-4 w-4" strokeWidth={2} />
              </button>
            </div>

            {status === 'done' ? (
              <div className="p-5">
                <div className="rounded border border-positive/40 bg-positive/10 p-4 text-sm text-positive">
                  ✅ Request sent! {matchedName ?? 'A verified broker'} will
                  contact you within 24 hours via WhatsApp about{' '}
                  {buildingProject}.
                </div>
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="mt-4 btn-primary w-full h-11 text-sm"
                >
                  Done
                </button>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  submit();
                }}
                className="p-4 sm:p-5 space-y-3"
              >
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                    Full name <span className="text-negative">*</span>
                  </span>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="As it appears on Emirates ID"
                    className="input-field mt-1 min-h-[44px]"
                  />
                </label>
                <label className="block">
                  <span className="block text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
                    WhatsApp number <span className="text-negative">*</span>
                  </span>
                  <input
                    type="tel"
                    inputMode="tel"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                    required
                    placeholder="+9715XXXXXXXX"
                    className="input-field mt-1 min-h-[44px]"
                  />
                </label>
                {err && (
                  <div className="rounded border border-negative/40 bg-negative/10 px-3 py-2 text-xs text-negative">
                    {err}
                  </div>
                )}
                <button
                  type="submit"
                  disabled={status === 'loading'}
                  className="btn-primary w-full inline-flex items-center justify-center gap-1.5 h-11 text-sm"
                >
                  <Phone className="h-3.5 w-3.5" strokeWidth={2.5} />
                  {status === 'loading' ? 'Sending…' : 'Send request'}
                </button>
                <p className="text-[10px] text-fg-subtle text-center">
                  By submitting, you allow a RERA-licensed broker to contact you
                  via WhatsApp.
                </p>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
