/**
 * Broker auth — stores the broker JWT in localStorage.
 *
 * Intentionally simple per Phase 2 spec ("simple email/password or magic-link
 * placeholder, do not overbuild auth yet"). Can be upgraded to httpOnly cookies
 * later without changing call sites.
 */

const TOKEN_KEY = 'floxcy_broker_token';

export function getBrokerToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

export function setBrokerToken(token: string): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

export function clearBrokerToken(): void {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(TOKEN_KEY);
}

export function isBrokerAuthed(): boolean {
  return getBrokerToken() !== null;
}
