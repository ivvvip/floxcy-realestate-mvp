'use client';

import { useEffect, useState } from 'react';
import { Check, X } from 'lucide-react';
import type {
  Broker,
  BrokerApplication,
  BrokerApproveResponse,
} from '@/lib/types';
import {
  adminApproveBrokerApplication,
  adminListBrokerApplications,
  adminListBrokers,
  adminRejectBrokerApplication,
} from '@/lib/api';

export function AdminBrokersClient() {
  const [apps, setApps] = useState<BrokerApplication[]>([]);
  const [brokers, setBrokers] = useState<Broker[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [credentials, setCredentials] = useState<{ email: string; temp_password: string } | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([
        adminListBrokerApplications(),
        adminListBrokers(),
      ]);
      setApps(a);
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

  async function approve(id: string) {
    try {
      const res: BrokerApproveResponse = await adminApproveBrokerApplication(id);
      if (res.temp_password) {
        setCredentials({ email: res.broker.email, temp_password: res.temp_password });
      }
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Approval failed.');
    }
  }

  async function reject(id: string) {
    if (!confirm('Reject this broker application?')) return;
    try {
      await adminRejectBrokerApplication(id);
      refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Rejection failed.');
    }
  }

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;

  return (
    <div className="space-y-6">
      {credentials && (
        <div className="border border-accent/40 bg-accent/10 rounded-lg p-4 text-sm space-y-1">
          <div className="font-medium text-accent">Broker approved — credentials</div>
          <div className="text-fg">
            Email: <code className="bg-bg-card px-1 rounded">{credentials.email}</code>
          </div>
          <div className="text-fg">
            Temp password: <code className="bg-bg-card px-1 rounded">{credentials.temp_password}</code>
          </div>
          <div className="text-[11px] text-fg-muted">
            Hand these off out-of-band. They will not be shown again.
          </div>
          <button
            type="button"
            onClick={() => setCredentials(null)}
            className="text-xs text-fg-muted hover:text-fg underline"
          >
            Dismiss
          </button>
        </div>
      )}

      <Section title={`Pending applications (${apps.filter((a) => a.status === 'pending').length})`}>
        {apps.filter((a) => a.status === 'pending').length === 0 ? (
          <div className="text-sm text-fg-muted">No pending applications.</div>
        ) : (
          <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>RERA</th>
                  <th>Experience</th>
                  <th>Submitted</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {apps.filter((a) => a.status === 'pending').map((a) => (
                  <tr key={a.id}>
                    <td className="text-fg">{a.full_name}</td>
                    <td className="text-fg-muted">{a.company_name ?? '—'}</td>
                    <td className="text-fg-muted text-[11px]">{a.email}</td>
                    <td className="text-fg-muted text-[11px]">{a.rera_license ?? '—'}</td>
                    <td className="num text-fg-muted">{a.experience_years ?? '—'}</td>
                    <td className="text-fg-subtle text-[11px]">
                      {new Date(a.created_at).toLocaleDateString()}
                    </td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => approve(a.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-md bg-positive/20 text-positive text-xs px-2 hover:bg-positive/30"
                        >
                          <Check className="h-3 w-3" strokeWidth={2} /> Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => reject(a.id)}
                          className="inline-flex h-7 items-center gap-1 rounded-md bg-negative/20 text-negative text-xs px-2 hover:bg-negative/30"
                        >
                          <X className="h-3 w-3" strokeWidth={2} /> Reject
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Approved brokers (${brokers.length})`}>
        {brokers.length === 0 ? (
          <div className="text-sm text-fg-muted">No brokers yet.</div>
        ) : (
          <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Company</th>
                  <th>Email</th>
                  <th>Status</th>
                  <th className="text-right">Perf</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {brokers.map((b) => (
                  <tr key={b.id}>
                    <td className="text-fg">{b.full_name}</td>
                    <td className="text-fg-muted">{b.company_name ?? '—'}</td>
                    <td className="text-fg-muted text-[11px]">{b.email}</td>
                    <td className="text-fg-muted">{b.status}</td>
                    <td className="num">{b.performance_score.toFixed(0)}</td>
                    <td className="text-fg-subtle text-[11px]">
                      {new Date(b.created_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <h2 className="text-sm font-medium text-fg">{title}</h2>
      {children}
    </div>
  );
}
