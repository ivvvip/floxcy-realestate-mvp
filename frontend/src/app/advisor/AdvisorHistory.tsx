'use client';

import { Clock, RotateCcw, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { formatAED } from '@/lib/format';
import { cn } from '@/lib/cn';
import type { AdvisorGoal, AdvisorRisk } from '@/lib/types';

const STORAGE_KEY = 'floxcy.advisor.history.v1';
const MAX_ENTRIES = 5;

export interface HistoryEntry {
  /** ISO timestamp the query was submitted */
  ts: string;
  budget_aed: number;
  goal: AdvisorGoal;
  risk: AdvisorRisk;
  preferred_city: string;
  user_question: string;
  /** Top recommendation area names — surfaced as the headline of each
   *  card so the user can pick which conversation to resume. */
  top_picks: string[];
}

export function loadHistory(): HistoryEntry[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.slice(0, MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

export function pushHistory(entry: HistoryEntry): void {
  if (typeof window === 'undefined') return;
  try {
    const prior = loadHistory();
    // De-duplicate by (goal, budget, question) — repeated identical queries
    // shouldn't crowd out distinct ones.
    const sig = (e: HistoryEntry) => `${e.goal}|${e.budget_aed}|${e.user_question}`;
    const next = [entry, ...prior.filter((p) => sig(p) !== sig(entry))].slice(0, MAX_ENTRIES);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // ignore — history is best-effort
  }
}

export function clearHistory(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

interface Props {
  onResume: (entry: HistoryEntry) => void;
}

export function AdvisorHistoryPanel({ onResume }: Props) {
  const [entries, setEntries] = useState<HistoryEntry[]>([]);

  useEffect(() => {
    setEntries(loadHistory());
  }, []);

  if (entries.length === 0) return null;

  return (
    <div className="border border-border rounded-lg bg-bg-card overflow-hidden">
      <div className="border-b border-border px-4 py-2.5 flex items-center justify-between">
        <h3 className="text-xs font-semibold text-fg inline-flex items-center gap-1.5">
          <Clock className="h-3 w-3 text-accent" strokeWidth={2.5} />
          Continue a previous conversation
        </h3>
        <button
          type="button"
          onClick={() => {
            clearHistory();
            setEntries([]);
          }}
          className="text-[10px] text-fg-subtle hover:text-negative inline-flex items-center gap-1"
        >
          <Trash2 className="h-2.5 w-2.5" strokeWidth={2.5} />
          Clear
        </button>
      </div>
      <ul className="divide-y divide-border">
        {entries.map((e, i) => (
          <li key={`${e.ts}-${i}`}>
            <button
              type="button"
              onClick={() => onResume(e)}
              className="w-full text-left px-4 py-2.5 hover:bg-bg-elev/40 transition-colors"
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-xs font-medium text-fg">
                  {labelGoal(e.goal)} · {labelRisk(e.risk)} · {formatAED(e.budget_aed, { compact: true })}
                </span>
                <span className="text-[10px] text-fg-subtle tabular">{prettyTs(e.ts)}</span>
              </div>
              {e.top_picks.length > 0 && (
                <div className="mt-0.5 text-[11px] text-fg-muted truncate">
                  Top picks: {e.top_picks.slice(0, 3).join(' · ')}
                </div>
              )}
              {e.user_question && (
                <div className="mt-0.5 text-[10px] text-fg-subtle italic truncate">
                  &ldquo;{e.user_question}&rdquo;
                </div>
              )}
              <div className="mt-1 inline-flex items-center gap-1 text-[10px] text-accent">
                <RotateCcw className="h-2.5 w-2.5" strokeWidth={2.5} />
                Resume
              </div>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function labelGoal(g: AdvisorGoal): string {
  return g === 'yield' ? 'Cash flow' : g === 'appreciation' ? 'Growth' : 'Balanced';
}

function labelRisk(r: AdvisorRisk): string {
  return r === 'low' ? 'Conservative' : r === 'high' ? 'Aggressive' : 'Balanced';
}

function prettyTs(iso: string): string {
  try {
    const d = new Date(iso);
    const now = Date.now();
    const ms = now - d.getTime();
    const mins = Math.floor(ms / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return d.toISOString().slice(0, 10);
  } catch {
    return iso;
  }
}

// Suppress unused warning for cn — exported for future styling additions
void cn;
