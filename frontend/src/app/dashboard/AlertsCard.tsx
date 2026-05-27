'use client';

import { useEffect, useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { deleteAlert, getAlerts } from '@/lib/api';
import type { AlertOut } from '@/lib/types';
import { AlertCreator } from '@/components/data/AlertCreator';

export function AlertsCard() {
  const [alerts, setAlerts] = useState<AlertOut[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      const list = await getAlerts();
      setAlerts(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function remove(id: string) {
    try {
      await deleteAlert(id);
      refresh();
    } catch {
      // silent
    }
  }

  return (
    <div className="border border-border rounded-lg bg-bg-card">
      <div className="chart-header">
        <span className="chart-header-label inline-flex items-center gap-1.5">
          <Bell className="h-3.5 w-3.5" strokeWidth={2} />
          Investor alerts
        </span>
        <span className="text-[11px] text-fg-subtle tabular">
          {alerts.length} active
        </span>
      </div>
      <div className="p-4 border-b border-border">
        <AlertCreator compact onCreated={refresh} />
      </div>
      <div className="overflow-x-auto scrollbar-thin">
        {loading ? (
          <div className="px-4 py-6 text-center text-xs text-fg-subtle">Loading…</div>
        ) : error ? (
          <div className="px-4 py-6 text-center text-xs text-negative">{error}</div>
        ) : alerts.length === 0 ? (
          <div className="px-4 py-6 text-center text-xs text-fg-subtle">
            No alerts yet — set one above to get notified when conditions are met.
          </div>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Condition</th>
                <th>Area</th>
                <th>Params</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td className="text-fg">{a.type_label}</td>
                  <td className="text-fg-muted">{a.area_name ?? 'Any area'}</td>
                  <td className="text-[11px] text-fg-muted tabular">
                    {Object.keys(a.params).length > 0
                      ? Object.entries(a.params)
                          .map(([k, v]) => `${k}=${v}`)
                          .join(', ')
                      : '—'}
                  </td>
                  <td className="text-[11px] text-fg-muted tabular">
                    {new Date(a.created_at).toISOString().slice(0, 10)}
                  </td>
                  <td className="text-right">
                    <button
                      type="button"
                      onClick={() => remove(a.id)}
                      className="inline-flex items-center gap-1 text-[11px] text-negative hover:text-negative/80"
                    >
                      <Trash2 className="h-3 w-3" strokeWidth={2} />
                      Remove
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      <div className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
        Alerts are stored against your browser session (anonymous) or your
        account (when signed in). Email/WhatsApp/Telegram delivery is on the
        roadmap.
      </div>
    </div>
  );
}
