'use client';

import { useState, type FormEvent } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authLogin, ApiError } from '@/lib/api';
import { LogIn } from 'lucide-react';

export function LoginForm() {
  const router = useRouter();
  const search = useSearchParams();
  const next = search?.get('next') || '/admin';
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await authLogin(username, password);
      router.replace(next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        setError('Invalid credentials.');
      } else if (err instanceof ApiError && err.status === 429) {
        setError('Too many attempts. Wait one minute and try again.');
      } else {
        setError(err instanceof Error ? err.message : 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg bg-bg-card"
    >
      <div className="chart-header">
        <span className="chart-header-label">Credentials</span>
      </div>
      <div className="p-5 space-y-4">
        <div>
          <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            Username
          </label>
          <input
            autoFocus
            type="text"
            autoComplete="username"
            required
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="input-field mt-1"
          />
        </div>
        <div>
          <label className="text-[11px] uppercase tracking-wide text-fg-subtle font-medium">
            Password
          </label>
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="input-field mt-1"
          />
        </div>
        <button
          type="submit"
          disabled={!username || !password || loading}
          className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-md bg-accent text-sm font-medium text-accent-fg hover:bg-accent/90 transition-colors disabled:cursor-not-allowed disabled:opacity-50"
        >
          <LogIn className="h-3.5 w-3.5" strokeWidth={2} />
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        {error && (
          <div className="rounded-md border border-negative/30 bg-negative/10 px-3 py-2 text-xs text-negative">
            {error}
          </div>
        )}
        <div className="text-[11px] text-fg-subtle pt-2 border-t border-border">
          Admin bootstrap is seeded from <code className="text-fg">BOOTSTRAP_ADMIN_USERNAME</code> /{' '}
          <code className="text-fg">BOOTSTRAP_ADMIN_PASSWORD</code> env vars on the API.
          Contact your administrator for access.
        </div>
      </div>
    </form>
  );
}
