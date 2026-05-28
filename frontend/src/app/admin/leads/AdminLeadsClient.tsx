'use client';

import { useEffect, useState } from 'react';
import type { Broker, InvestorLead, LeadStatus } from '@/lib/types';
import {
  adminListBrokers,
  adminListLeads,
  adminUpdateLead,
} from '@/lib/api';
import { formatAED } from '@/lib/format';

const LEAD_STATUSES: LeadStatus[] = [
  'new', 'contacted', 'qualified', 'viewing',
  'negotiating', 'closed', 'lost',
];

export function AdminLeadsClient() {
  const [leads, setLeads] = useState<InvestorLead[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      const [l, b] = await Promise.all([
        adminListLeads(),
        adminListBrokers('approved'),
      ]);
      setLeads(l);
      setBrokers(b);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function update(id: string, payload: Parameters<typeof adminUpdateLead>[1]) {
    try {
      await adminUpdateLead(id, payload);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;

  if (!leads.length) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted">
        No leads yet.
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
            <th>Goal / area</th>
            <th>Assigned broker</th>
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
                {l.investment_goal && <div>{l.investment_goal}</div>}
                {l.preferred_area && <div>{l.preferred_area}</div>}
              </td>
              <td>
                <select
                  value={l.matched_broker_id ?? ''}
                  onChange={(e) =>
                    update(l.id, { matched_broker_id: e.target.value || undefined })
                  }
                  className="h-7 rounded border border-border bg-bg text-xs px-1.5 max-w-[180px]"
                >
                  <option value="">— unassigned —</option>
                  {brokers.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.full_name}
                      {b.company_name ? ` · ${b.company_name}` : ''}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={l.status}
                  onChange={(e) =>
                    update(l.id, { status: e.target.value as LeadStatus })
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
