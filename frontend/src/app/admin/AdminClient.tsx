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
    <form onSubmit={run} className="surface-card space-y-5 p-6">
      <div>
        <label className="text-sm font-medium text-fg-muted">
          Admin token (X-Admin-Token)
        </label>
        <input
          type="password"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Enter admin token"
          className="mt-2 w-full rounded-xl border border-border bg-bg-elev px-4 py-2.5 text-sm text-fg outline-none focus:border-accent"
        />
      </div>

      <button
        type="submit"
        disabled={!token || loading}
        className="inline-flex h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg shadow-glow disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? 'Re-seeding…' : 'Re-seed market snapshots'}
      </button>

      {result && !result.error && (
        <div className="rounded-xl border border-accent/30 bg-accent-muted px-4 py-3 text-sm text-accent">
          ✓ Seeded {result.snapshots} snapshots across {result.areas} areas.
        </div>
      )}
      {result?.error && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          {result.error}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
          {error}
        </div>
      )}
    </form>
  );
}
