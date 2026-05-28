'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { brokerLogin } from '@/lib/api';
import { setBrokerToken } from '@/lib/brokerAuth';

export function BrokerLoginClient() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      const res = await brokerLogin(email, password);
      setBrokerToken(res.token);
      router.push('/broker/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="border border-border rounded-lg bg-bg-card p-6 space-y-4"
    >
      <label className="block">
        <span className="text-xs text-fg-muted">Email</span>
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input-field mt-1"
        />
      </label>
      <label className="block">
        <span className="text-xs text-fg-muted">Password</span>
        <input
          type="password"
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="input-field mt-1"
        />
      </label>
      {error && <div className="text-xs text-negative">{error}</div>}
      <button
        type="submit"
        disabled={loading}
        className="inline-flex w-full h-10 items-center justify-center gap-1.5 rounded-md bg-accent text-bg text-sm font-medium hover:bg-accent/90 disabled:opacity-60"
      >
        {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2} />}
        {loading ? 'Signing in…' : 'Sign in'}
      </button>
      <p className="text-[11px] text-fg-subtle text-center">
        Not a broker yet?{' '}
        <Link href="/brokers/apply" className="text-accent hover:underline">
          Apply to join
        </Link>
      </p>
    </form>
  );
}
