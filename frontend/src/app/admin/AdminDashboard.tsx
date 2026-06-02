'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Copy, LogOut, RefreshCw, ShieldOff, KeyRound, Users, FileClock, Sparkles, Activity, Database } from 'lucide-react';
import {
  ApiError,
  adminAiAnalytics,
  adminListApiKeys,
  adminListAuditLog,
  adminListUsers,
  adminSeed,
  adminCreateApiKey,
  adminRevokeApiKey,
  authLogout,
  authMe,
  recomputeOpportunities,
  getAreaCoverageStats,
} from '@/lib/api';
import type {
  AIAnalyticsResponse,
  ApiKeyCreateResponse,
  ApiKeyPublic,
  AreaCoverageStats,
  AuditLogEntry,
  MeResponse,
} from '@/lib/types';
import { cn } from '@/lib/cn';

export function AdminDashboard() {
  const router = useRouter();
  const [me, setMe] = useState<MeResponse | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [users, setUsers] = useState<MeResponse[]>([]);
  const [keys, setKeys] = useState<ApiKeyPublic[]>([]);
  const [audit, setAudit] = useState<AuditLogEntry[]>([]);
  const [aiStats, setAiStats] = useState<AIAnalyticsResponse | null>(null);
  const [coverage, setCoverage] = useState<AreaCoverageStats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seedResult, setSeedResult] = useState<string | null>(null);
  const [seedLoading, setSeedLoading] = useState(false);
  const [recompResult, setRecompResult] = useState<string | null>(null);
  const [recompLoading, setRecompLoading] = useState(false);
  const [newKey, setNewKey] = useState<ApiKeyCreateResponse | null>(null);
  const [newKeyName, setNewKeyName] = useState('');
  const [newKeyTier, setNewKeyTier] = useState<'free' | 'pro' | 'api' | 'enterprise'>('pro');

  useEffect(() => {
    (async () => {
      try {
        const m = await authMe();
        setMe(m);
        setAuthChecked(true);
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) {
          router.replace('/admin/login');
          return;
        }
        setError(err instanceof Error ? err.message : 'Auth check failed');
        setAuthChecked(true);
      }
    })();
  }, [router]);

  async function refresh() {
    setError(null);
    try {
      const [u, k, a, ai, cov] = await Promise.all([
        adminListUsers().catch(() => []),
        adminListApiKeys().catch(() => []),
        adminListAuditLog({ limit: 50 }).catch(() => []),
        adminAiAnalytics().catch(() => null),
        getAreaCoverageStats().catch(() => null),
      ]);
      setUsers(u);
      setKeys(k);
      setAudit(a);
      setAiStats(ai);
      setCoverage(cov);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    }
  }

  useEffect(() => {
    if (me) refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me]);

  async function doSeed() {
    setSeedLoading(true);
    setSeedResult(null);
    try {
      const r = await adminSeed();
      setSeedResult(`✓ Seeded ${r.snapshots} snapshots across ${r.areas} areas.`);
      refresh();
    } catch (err) {
      setSeedResult(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setSeedLoading(false);
    }
  }

  async function doRecompute() {
    setRecompLoading(true);
    setRecompResult(null);
    try {
      const r = await recomputeOpportunities();
      setRecompResult(`✓ Cleared ${r.cleared_keys} AI explanation cache keys.`);
    } catch (err) {
      setRecompResult(err instanceof Error ? err.message : 'Recompute failed');
    } finally {
      setRecompLoading(false);
    }
  }

  async function createKey() {
    if (!newKeyName) return;
    try {
      const k = await adminCreateApiKey({ name: newKeyName, tier: newKeyTier });
      setNewKey(k);
      setNewKeyName('');
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create key failed');
    }
  }

  async function revokeKey(id: string) {
    if (!confirm('Revoke this API key permanently?')) return;
    try {
      await adminRevokeApiKey(id);
      refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Revoke failed');
    }
  }

  async function logout() {
    try {
      await authLogout();
    } catch {
      // ignore
    }
    router.replace('/admin/login');
    router.refresh();
  }

  if (!authChecked) {
    return <div className="text-sm text-fg-muted">Checking session…</div>;
  }

  if (!me) {
    return (
      <div className="border border-border rounded-lg bg-bg-card p-6 text-center">
        <p className="text-sm text-fg-muted">Not authenticated.</p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Session bar */}
      <div className="flex items-center justify-between border border-border rounded-lg bg-bg-card px-4 py-3">
        <div className="flex items-center gap-3">
          <span className="pill pill-accent">{me.role}</span>
          <span className="text-sm text-fg">{me.username}</span>
          {me.email && <span className="text-xs text-fg-muted">{me.email}</span>}
        </div>
        <button
          type="button"
          onClick={logout}
          className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-bg-elev/40 px-2.5 text-xs text-fg-muted hover:text-fg hover:border-border-strong transition-colors"
        >
          <LogOut className="h-3 w-3" strokeWidth={2} />
          Sign out
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
          {error}
        </div>
      )}

      {/* Data ops */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" strokeWidth={2} />
            Data operations
          </span>
        </div>
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={doSeed}
            disabled={seedLoading || me.role !== 'admin'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {seedLoading ? 'Seeding…' : 'Re-seed market snapshots'}
          </button>
          <span className="text-[11px] text-fg-subtle">
            Clears and re-inserts 12 monthly snapshots per area
          </span>
          {seedResult && (
            <span
              className={cn(
                'text-[11px] tabular',
                seedResult.startsWith('✓') ? 'text-positive' : 'text-negative'
              )}
            >
              {seedResult}
            </span>
          )}
        </div>
      </div>

      {/* Area Coverage */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <Database className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            Area Coverage · DLD
          </span>
          {coverage && (
            <span className="text-[11px] text-fg-subtle">
              {coverage.total_areas.toLocaleString()} areas total · Updated {coverage.last_updated}
            </span>
          )}
        </div>
        {!coverage ? (
          <div className="p-4 text-xs text-fg-subtle">
            Loading coverage stats…
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border border-border rounded overflow-hidden">
              <CovTile
                label="Full data"
                value={coverage.by_tier.full ?? 0}
                tone="positive"
                hint="curated + history"
              />
              <CovTile
                label="Partial"
                value={coverage.by_tier.partial ?? 0}
                tone="accent"
                hint="≥100 samples"
              />
              <CovTile
                label="Limited"
                value={coverage.by_tier.limited ?? 0}
                tone="warning"
                hint="<100 samples"
              />
              <CovTile
                label="No data"
                value={coverage.by_tier.none ?? 0}
                tone="muted"
                hint="DLD listed only"
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-[11px]">
              <div className="rounded border border-border bg-bg-elev px-3 py-2">
                <div className="text-fg-subtle">Curated areas</div>
                <div className="mt-0.5 text-fg font-mono">
                  {coverage.curated_count.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-border bg-bg-elev px-3 py-2">
                <div className="text-fg-subtle">DLD-only areas</div>
                <div className="mt-0.5 text-fg font-mono">
                  {coverage.dld_only_count.toLocaleString()}
                </div>
              </div>
              <div className="rounded border border-border bg-bg-elev px-3 py-2">
                <div className="text-fg-subtle">Total samples</div>
                <div className="mt-0.5 text-fg font-mono">
                  {coverage.samples_total_sales.toLocaleString()} sales ·{' '}
                  {coverage.samples_total_rents.toLocaleString()} rents
                </div>
              </div>
            </div>
            {coverage.area_gaps.length > 0 && (
              <details className="rounded border border-border bg-bg-elev px-3 py-2 text-[11px]">
                <summary className="cursor-pointer text-fg-muted hover:text-fg">
                  Data gaps — {coverage.area_gaps.length} DLD areas with no
                  2026 metrics (click to expand)
                </summary>
                <div className="mt-2 max-h-[240px] overflow-y-auto">
                  <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-1 text-fg-subtle">
                    {coverage.area_gaps.map((name) => (
                      <li key={name} className="truncate" title={name}>
                        · {name}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Opportunity Engine */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <Activity className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            Opportunity Engine
          </span>
          <span className="text-[11px] text-fg-subtle tabular">
            P1B · scoring v1
          </span>
        </div>
        <div className="p-4 flex items-center gap-3 flex-wrap">
          <button
            type="button"
            onClick={doRecompute}
            disabled={recompLoading || me.role !== 'admin'}
            className="inline-flex h-8 items-center gap-1.5 rounded-md bg-accent px-3 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            {recompLoading ? 'Clearing…' : 'Recompute all (clear AI cache)'}
          </button>
          <span className="text-[11px] text-fg-subtle">
            Drops all <code className="font-mono text-fg-muted">ai:opp_explain:*</code> keys in Redis.
            Next /opportunities/&#123;id&#125;/explain call regenerates fresh AI text.
          </span>
          {recompResult && (
            <span
              className={cn(
                'text-[11px] tabular',
                recompResult.startsWith('✓') ? 'text-positive' : 'text-negative'
              )}
            >
              {recompResult}
            </span>
          )}
        </div>
        <div className="border-t border-border px-4 py-2 text-[11px] text-fg-subtle">
          Opportunity scores are computed on read from current snapshots — no cache to clear there.
          AI explanations cached 24h per (area, score, type).
        </div>
      </div>

      {/* AI analytics */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-accent" strokeWidth={2} />
            AI analyst — usage &amp; cost
          </span>
          {aiStats && (
            <span className="text-[11px] text-fg-subtle tabular">
              as of {new Date(aiStats.as_of).toISOString().slice(0, 16).replace('T', ' ')}
            </span>
          )}
        </div>
        {!aiStats ? (
          <div className="p-5 text-center text-xs text-fg-subtle">
            No AI analytics yet.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-border">
              {(['today', 'week', 'month'] as const).map((bucket) => {
                const b = aiStats[bucket];
                return (
                  <div key={bucket} className="bg-bg-card p-4">
                    <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
                      {bucket}
                    </div>
                    <div className="mt-1 text-2xl tabular text-fg">
                      {b.queries}
                      <span className="text-xs text-fg-subtle ml-1">queries</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] tabular">
                      <div className="flex justify-between col-span-2 text-fg-muted">
                        <dt>Tokens</dt>
                        <dd>{b.total_tokens.toLocaleString()}</dd>
                      </div>
                      <div className="flex justify-between col-span-2 text-fg-muted">
                        <dt>Cost (USD)</dt>
                        <dd>${b.total_cost_usd.toFixed(5)}</dd>
                      </div>
                      <div className="flex justify-between col-span-2 text-fg-muted">
                        <dt>Avg latency</dt>
                        <dd>{b.avg_latency_ms} ms</dd>
                      </div>
                      <div className="flex justify-between col-span-2 text-fg-muted">
                        <dt>Cached / Fallback / Errors</dt>
                        <dd>{b.cached_count} · {b.fallback_count} · {b.errors}</dd>
                      </div>
                    </dl>
                  </div>
                );
              })}
            </div>
            {Object.keys(aiStats.by_model).length > 0 && (
              <div className="border-t border-border px-4 py-3">
                <div className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium mb-2">
                  Model usage (30 days)
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(aiStats.by_model).map(([m, n]) => (
                    <span key={m} className="pill tabular">
                      {m.split('/').pop()} · {n}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* API keys */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <KeyRound className="h-3.5 w-3.5" strokeWidth={2} />
            API keys
          </span>
          <span className="text-[11px] text-fg-subtle tabular">
            {keys.length} total
          </span>
        </div>
        {newKey && (
          <div className="border-b border-border bg-positive/10 px-4 py-3">
            <div className="text-[11px] uppercase tracking-wide text-positive font-medium">
              New key — copy now, you won&apos;t see it again
            </div>
            <div className="mt-2 flex items-center gap-2 flex-wrap">
              <code className="font-mono text-xs bg-bg/80 px-2 py-1 rounded border border-border text-fg break-all">
                {newKey.full_key}
              </code>
              <button
                type="button"
                onClick={() => navigator.clipboard.writeText(newKey.full_key)}
                className="inline-flex h-7 items-center gap-1 rounded-md border border-border bg-bg-elev/60 px-2 text-[11px] text-fg-muted hover:text-fg"
              >
                <Copy className="h-3 w-3" strokeWidth={2} />
                Copy
              </button>
              <button
                type="button"
                onClick={() => setNewKey(null)}
                className="text-[11px] text-fg-muted hover:text-fg ml-auto"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
        <div className="p-4 grid grid-cols-1 md:grid-cols-[1fr_auto_auto] gap-2 items-end border-b border-border">
          <div>
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              New key name
            </label>
            <input
              type="text"
              value={newKeyName}
              onChange={(e) => setNewKeyName(e.target.value)}
              placeholder="e.g. acme-corp-prod"
              className="input-field mt-1"
            />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
              Tier
            </label>
            <select
              value={newKeyTier}
              onChange={(e) => setNewKeyTier(e.target.value as typeof newKeyTier)}
              className="input-field mt-1"
            >
              <option value="free">free</option>
              <option value="pro">pro</option>
              <option value="api">api</option>
              <option value="enterprise">enterprise</option>
            </select>
          </div>
          <button
            type="button"
            onClick={createKey}
            disabled={!newKeyName || me.role !== 'admin'}
            className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-xs font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
          >
            Issue
          </button>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th>Prefix</th>
                <th>Name</th>
                <th>Tier</th>
                <th className="text-right">Rate/min</th>
                <th>Status</th>
                <th>Created</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {keys.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center text-fg-subtle py-6">
                    No API keys yet.
                  </td>
                </tr>
              ) : (
                keys.map((k) => (
                  <tr key={k.id}>
                    <td>
                      <code className="font-mono text-xs text-fg">{k.prefix}</code>
                    </td>
                    <td>{k.name}</td>
                    <td>
                      <span className="pill">{k.tier}</span>
                    </td>
                    <td className="num">
                      {k.rate_limit_per_min ?? '—'}
                    </td>
                    <td>
                      {k.revoked_at ? (
                        <span className="pill pill-negative">revoked</span>
                      ) : k.is_active ? (
                        <span className="pill pill-positive">active</span>
                      ) : (
                        <span className="pill">inactive</span>
                      )}
                    </td>
                    <td className="text-[11px] text-fg-muted tabular">
                      {new Date(k.created_at).toISOString().slice(0, 10)}
                    </td>
                    <td className="text-right">
                      {!k.revoked_at && (
                        <button
                          type="button"
                          onClick={() => revokeKey(k.id)}
                          className="inline-flex items-center gap-1 text-[11px] text-negative hover:text-negative/80"
                        >
                          <ShieldOff className="h-3 w-3" strokeWidth={2} />
                          Revoke
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Users */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <Users className="h-3.5 w-3.5" strokeWidth={2} />
            Users
          </span>
          <span className="text-[11px] text-fg-subtle tabular">
            {users.length} total
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Status</th>
                <th>Last login</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center text-fg-subtle py-6">
                    No users.
                  </td>
                </tr>
              ) : (
                users.map((u) => (
                  <tr key={u.id}>
                    <td className="font-medium text-fg">{u.username}</td>
                    <td className="text-fg-muted">{u.email ?? '—'}</td>
                    <td>
                      <span
                        className={cn(
                          'pill',
                          u.role === 'admin' && 'pill-accent'
                        )}
                      >
                        {u.role}
                      </span>
                    </td>
                    <td>
                      {u.is_active ? (
                        <span className="pill pill-positive">active</span>
                      ) : (
                        <span className="pill pill-negative">disabled</span>
                      )}
                    </td>
                    <td className="text-[11px] text-fg-muted tabular">
                      {u.last_login_at
                        ? new Date(u.last_login_at).toISOString().slice(0, 16).replace('T', ' ')
                        : 'never'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Audit log */}
      <div className="border border-border rounded-lg bg-bg-card">
        <div className="chart-header">
          <span className="chart-header-label inline-flex items-center gap-1.5">
            <FileClock className="h-3.5 w-3.5" strokeWidth={2} />
            Audit log
          </span>
          <span className="text-[11px] text-fg-subtle tabular">
            last {audit.length}
          </span>
        </div>
        <div className="overflow-x-auto scrollbar-thin">
          <table className="data-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Target</th>
                <th>Status</th>
                <th>IP</th>
              </tr>
            </thead>
            <tbody>
              {audit.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center text-fg-subtle py-6">
                    No audit entries yet.
                  </td>
                </tr>
              ) : (
                audit.map((a) => (
                  <tr key={a.id}>
                    <td className="text-[11px] text-fg-muted tabular whitespace-nowrap">
                      {new Date(a.created_at).toISOString().replace('T', ' ').slice(0, 19)}
                    </td>
                    <td>{a.actor_label}</td>
                    <td>
                      <code className="font-mono text-[11px] text-fg">{a.action}</code>
                    </td>
                    <td className="text-fg-muted text-[11px]">
                      {a.target_type ? `${a.target_type}:${a.target_id ?? ''}` : '—'}
                    </td>
                    <td>
                      <span
                        className={cn(
                          'pill',
                          a.status === 'ok' && 'pill-positive',
                          a.status === 'denied' && 'pill-negative'
                        )}
                      >
                        {a.status}
                      </span>
                    </td>
                    <td className="text-[11px] text-fg-muted tabular">{a.ip ?? '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function CovTile({
  label,
  value,
  tone,
  hint,
}: {
  label: string;
  value: number;
  tone: 'positive' | 'accent' | 'warning' | 'muted';
  hint?: string;
}) {
  return (
    <div className="bg-bg-card px-3 py-3">
      <div className="text-[10px] uppercase tracking-wide text-fg-subtle font-medium">
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl leading-tight tabular font-mono',
          tone === 'positive' && 'text-positive',
          tone === 'accent' && 'text-accent',
          tone === 'warning' && 'text-warning',
          tone === 'muted' && 'text-fg-subtle'
        )}
      >
        {value.toLocaleString()}
      </div>
      {hint && (
        <div className="mt-0.5 text-[10px] text-fg-subtle">{hint}</div>
      )}
    </div>
  );
}
