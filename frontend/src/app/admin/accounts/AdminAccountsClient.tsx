'use client';

import { useEffect, useState } from 'react';
import { ShieldCheck, Star, Inbox } from 'lucide-react';
import type { AccountsOverview, ProfilePatchRequest } from '@/lib/types';
import {
  adminListAccounts,
  adminPatchBrokerProfile,
  adminPatchAgencyProfile,
  adminPatchDeveloperAccount,
} from '@/lib/api';

type Tab = 'brokers' | 'agencies' | 'developers';

const TIER_OPTIONS = [
  'free', 'investor_premium', 'broker_basic', 'broker_premium',
  'agency', 'developer_basic', 'developer_pro',
];

export function AdminAccountsClient() {
  const [data, setData] = useState<AccountsOverview | null>(null);
  const [tab, setTab] = useState<Tab>('brokers');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    setLoading(true);
    try {
      setData(await adminListAccounts());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load accounts.');
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function patch(kind: Tab, id: string, body: ProfilePatchRequest) {
    try {
      if (kind === 'brokers') await adminPatchBrokerProfile(id, body);
      else if (kind === 'agencies') await adminPatchAgencyProfile(id, body);
      else await adminPatchDeveloperAccount(id, body);
      await refresh();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Update failed.');
    }
  }

  if (loading) return <div className="text-sm text-fg-muted">Loading…</div>;
  if (error) return <div className="text-sm text-negative">{error}</div>;
  if (!data) return null;

  const tabs: { key: Tab; label: string; n: number }[] = [
    { key: 'brokers', label: 'Brokers', n: data.counts.brokers ?? 0 },
    { key: 'agencies', label: 'Agencies', n: data.counts.agencies ?? 0 },
    { key: 'developers', label: 'Developers', n: data.counts.developers ?? 0 },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 flex-wrap border-b border-border pb-2">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              tab === t.key ? 'bg-accent text-bg' : 'text-fg-muted hover:text-fg hover:bg-bg-elev/40'
            }`}
          >
            {t.label}
            <span className={`tabular text-[10px] ${tab === t.key ? 'text-bg/70' : 'text-fg-subtle'}`}>{t.n}</span>
          </button>
        ))}
      </div>

      {((tab === 'brokers' && data.brokers.length === 0) ||
        (tab === 'agencies' && data.agencies.length === 0) ||
        (tab === 'developers' && data.developers.length === 0)) ? (
        <div className="border border-border rounded-lg bg-bg-card p-8 text-center text-sm text-fg-muted flex flex-col items-center gap-2">
          <Inbox className="h-5 w-5 text-fg-subtle" />
          No claimed {tab} yet. They appear here once a claim is approved in
          <a href="/admin/claims" className="text-accent hover:underline ml-1">Claims</a>.
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-bg-card overflow-x-auto">
          <table className="data-table w-full">
            <thead>
              <tr>
                <th>{tab === 'brokers' ? 'Broker #' : tab === 'agencies' ? 'Agency' : 'Developer'}</th>
                <th>Tier</th>
                <th className="text-center">Verified</th>
                {tab !== 'developers' && <th className="text-center">Featured</th>}
                {tab === 'developers' && <th className="text-center">Lead access</th>}
                <th>Claimed</th>
              </tr>
            </thead>
            <tbody>
              {tab === 'brokers' && data.brokers.map((b) => (
                <tr key={b.id}>
                  <td className="text-fg tabular">{b.broker_number}</td>
                  <TierCell tier={b.subscription_tier} onChange={(v) => patch('brokers', b.id, { subscription_tier: v })} />
                  <ToggleCell on={b.is_verified} icon="verify" onClick={() => patch('brokers', b.id, { is_verified: !b.is_verified })} />
                  <ToggleCell on={b.is_featured} icon="feature" onClick={() => patch('brokers', b.id, { is_featured: !b.is_featured })} />
                  <td className="text-[11px] text-fg-muted tabular">{b.claimed_at?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
              {tab === 'agencies' && data.agencies.map((a) => (
                <tr key={a.id}>
                  <td className="text-fg">{a.agency_name}<div className="text-[11px] text-fg-subtle tabular">#{a.real_estate_number ?? '—'}</div></td>
                  <TierCell tier={a.subscription_tier} onChange={(v) => patch('agencies', a.id, { subscription_tier: v })} />
                  <ToggleCell on={a.is_verified} icon="verify" onClick={() => patch('agencies', a.id, { is_verified: !a.is_verified })} />
                  <ToggleCell on={a.is_featured} icon="feature" onClick={() => patch('agencies', a.id, { is_featured: !a.is_featured })} />
                  <td className="text-[11px] text-fg-muted tabular">{a.claimed_at?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
              {tab === 'developers' && data.developers.map((d) => (
                <tr key={d.id}>
                  <td className="text-fg">{d.developer_name ?? d.developer_number}<div className="text-[11px] text-fg-subtle tabular">#{d.developer_number}</div></td>
                  <TierCell tier={d.subscription_tier} onChange={(v) => patch('developers', d.id, { subscription_tier: v })} />
                  <ToggleCell on={d.is_verified} icon="verify" onClick={() => patch('developers', d.id, { is_verified: !d.is_verified })} />
                  <ToggleCell on={d.lead_access} icon="lead" onClick={() => patch('developers', d.id, { lead_access: !d.lead_access })} />
                  <td className="text-[11px] text-fg-muted tabular">{d.claimed_at?.slice(0, 10) ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function TierCell({ tier, onChange }: { tier: string; onChange: (v: string) => void }) {
  return (
    <td>
      <select
        value={tier}
        onChange={(e) => onChange(e.target.value)}
        className="bg-bg-elev/60 border border-border rounded-md px-2 py-1 text-[11px] text-fg focus:outline-none focus:border-accent/60"
      >
        {TIER_OPTIONS.map((t) => <option key={t} value={t}>{t}</option>)}
      </select>
    </td>
  );
}

function ToggleCell({ on, icon, onClick }: { on: boolean; icon: 'verify' | 'feature' | 'lead'; onClick: () => void }) {
  const Icon = icon === 'feature' ? Star : icon === 'lead' ? Inbox : ShieldCheck;
  return (
    <td className="text-center">
      <button
        onClick={onClick}
        title={on ? 'On — click to turn off' : 'Off — click to turn on'}
        className={`inline-flex items-center justify-center h-6 w-6 rounded border transition-colors ${
          on ? 'border-positive/40 text-positive bg-positive/10' : 'border-border text-fg-subtle hover:text-fg'
        }`}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.5} />
      </button>
    </td>
  );
}
