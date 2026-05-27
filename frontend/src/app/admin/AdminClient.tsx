'use client';

import { useState } from 'react';
import { adminSeed } from '@/lib/api';

export function AdminClient() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ areas?: number; snapshots?: number; error?: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!token) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await adminSeed(token);
      setResult(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seed failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={run} className="border border-border rounded-lg bg-bg-card">
      <div className="chart-header">
        <span className="chart-header-label">Seed market snapshots</span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            Admin token (X-Admin-Token)
          </label>
          <input
            type="password"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter admin token"
            className="input-field mt-1"
          />
        </div>

        <button
          type="submit"
          disabled={!token || loading}
          className="inline-flex h-9 items-center justify-center rounded-md bg-accent px-4 text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? 'Re-seeding…' : 'Re-seed market snapshots'}
        </button>

        {result && !result.error && (
          <div className="rounded-md border border-positive/30 bg-positive/10 px-3 py-2 text-xs text-positive tabular">
            ✓ Seeded {result.snapshots} snapshots across {result.areas} areas.
          </div>
        )}
        {result?.error && (
          <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {result.error}
          </div>
        )}
        {error && (
          <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </div>
        )}
      </div>
    </form>
  );
}
