'use client';

import { useState } from 'react';
import {
  ArrowLeft, ArrowRight, BarChart3, Building2, Coins, Scale, Sparkles, X,
} from 'lucide-react';
import { cn } from '@/lib/cn';

export type OnboardingGoal = 'income' | 'growth' | 'both' | 'offplan';
export type OnboardingBudget = 'lt500k' | '500k-1m' | '1m-3m' | '3m+';
export type OnboardingTimeline = '1-2y' | '3-5y' | '5y+';
export type OnboardingRisk = 'conservative' | 'balanced' | 'aggressive';

export interface OnboardingResult {
  goal: OnboardingGoal;
  budget: OnboardingBudget;
  timeline: OnboardingTimeline;
  risk: OnboardingRisk;
}

const STORAGE_KEY = 'floxcy.advisor.onboarded.v1';

/** Has the user completed the wizard before? Read once at mount; subsequent
 *  wizard launches are explicit (via the "Replay onboarding" link). */
export function readOnboardingSeen(): boolean {
  if (typeof window === 'undefined') return true; // SSR safety
  return localStorage.getItem(STORAGE_KEY) === '1';
}

export function markOnboardingSeen(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, '1');
  } catch {
    // private browsing or storage full — ignore, wizard just shows again
  }
}

interface Props {
  onComplete: (r: OnboardingResult) => void;
  onSkip: () => void;
}

export function AdvisorOnboarding({ onComplete, onSkip }: Props) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [goal, setGoal] = useState<OnboardingGoal | null>(null);
  const [budget, setBudget] = useState<OnboardingBudget | null>(null);
  const [timeline, setTimeline] = useState<OnboardingTimeline | null>(null);
  const [risk, setRisk] = useState<OnboardingRisk | null>(null);

  const finish = () => {
    if (!goal || !budget || !timeline || !risk) return;
    markOnboardingSeen();
    onComplete({ goal, budget, timeline, risk });
  };

  const skip = () => {
    markOnboardingSeen();
    onSkip();
  };

  return (
    <div className="fixed inset-0 z-50 bg-bg/90 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-accent" strokeWidth={2.5} />
            <h2 className="text-sm font-semibold text-fg">Quick setup</h2>
            <span className="text-[10px] text-fg-subtle tabular">Step {step}/4</span>
          </div>
          <button
            type="button"
            onClick={skip}
            className="text-[11px] text-fg-subtle hover:text-fg inline-flex items-center gap-1"
          >
            Skip <X className="h-3 w-3" strokeWidth={2.5} />
          </button>
        </div>

        {/* Progress bar */}
        <div className="h-1 bg-bg-elev">
          <div
            className="h-1 bg-accent transition-all duration-300"
            style={{ width: `${(step / 4) * 100}%` }}
          />
        </div>

        {/* Body */}
        <div className="px-6 py-6 min-h-[280px]">
          {step === 1 && (
            <StepPanel question="What's your goal?">
              <div className="grid grid-cols-2 gap-2">
                <ChoiceCard
                  icon={<Coins className="h-5 w-5" />}
                  emoji="💰"
                  label="Income"
                  hint="Maximise rental yield + monthly cash flow"
                  active={goal === 'income'}
                  onClick={() => setGoal('income')}
                />
                <ChoiceCard
                  icon={<BarChart3 className="h-5 w-5" />}
                  emoji="📈"
                  label="Growth"
                  hint="Capital appreciation over 5+ years"
                  active={goal === 'growth'}
                  onClick={() => setGoal('growth')}
                />
                <ChoiceCard
                  icon={<Scale className="h-5 w-5" />}
                  emoji="⚖️"
                  label="Both"
                  hint="Balanced yield + appreciation"
                  active={goal === 'both'}
                  onClick={() => setGoal('both')}
                />
                <ChoiceCard
                  icon={<Building2 className="h-5 w-5" />}
                  emoji="🏗️"
                  label="Off-Plan"
                  hint="Pre-completion, lower entry + handover risk"
                  active={goal === 'offplan'}
                  onClick={() => setGoal('offplan')}
                />
              </div>
            </StepPanel>
          )}

          {step === 2 && (
            <StepPanel question="Your budget?">
              <div className="grid grid-cols-2 gap-2">
                <SimpleChoice label="Under 500K AED" active={budget === 'lt500k'} onClick={() => setBudget('lt500k')} />
                <SimpleChoice label="500K – 1M AED"  active={budget === '500k-1m'} onClick={() => setBudget('500k-1m')} />
                <SimpleChoice label="1M – 3M AED"    active={budget === '1m-3m'}  onClick={() => setBudget('1m-3m')} />
                <SimpleChoice label="3M+ AED"        active={budget === '3m+'}     onClick={() => setBudget('3m+')} />
              </div>
              <p className="mt-3 text-[11px] text-fg-subtle">
                Used to filter areas where the median entry price fits your budget.
              </p>
            </StepPanel>
          )}

          {step === 3 && (
            <StepPanel question="Timeline?">
              <div className="grid grid-cols-3 gap-2">
                <SimpleChoice label="1–2 years"  active={timeline === '1-2y'} onClick={() => setTimeline('1-2y')} />
                <SimpleChoice label="3–5 years"  active={timeline === '3-5y'} onClick={() => setTimeline('3-5y')} />
                <SimpleChoice label="5+ years"   active={timeline === '5y+'}  onClick={() => setTimeline('5y+')} />
              </div>
              <p className="mt-3 text-[11px] text-fg-subtle">
                Shorter timelines lean toward cash flow + freehold + lower supply
                risk. Longer timelines tolerate off-plan + appreciation plays.
              </p>
            </StepPanel>
          )}

          {step === 4 && (
            <StepPanel question="Risk tolerance?">
              <div className="grid grid-cols-3 gap-2">
                <ToneChoice label="Conservative" tone="positive" active={risk === 'conservative'} onClick={() => setRisk('conservative')} />
                <ToneChoice label="Balanced"     tone="neutral"  active={risk === 'balanced'}     onClick={() => setRisk('balanced')} />
                <ToneChoice label="Aggressive"   tone="negative" active={risk === 'aggressive'}   onClick={() => setRisk('aggressive')} />
              </div>
              <p className="mt-3 text-[11px] text-fg-subtle">
                Conservative penalises high off-plan share heavily. Aggressive
                slightly rewards it (more upside, more downside).
              </p>
            </StepPanel>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3 | 4) : s))}
            disabled={step === 1}
            className="inline-flex h-9 items-center gap-1 rounded-md border border-border px-3 text-xs text-fg-muted hover:text-fg disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ArrowLeft className="h-3 w-3" strokeWidth={2.5} /> Back
          </button>
          <div className="flex items-center gap-2">
            {step < 4 ? (
              <button
                type="button"
                onClick={() => setStep((s) => ((s + 1) as 1 | 2 | 3 | 4))}
                disabled={
                  (step === 1 && !goal) ||
                  (step === 2 && !budget) ||
                  (step === 3 && !timeline)
                }
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-semibold text-accent-fg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </button>
            ) : (
              <button
                type="button"
                onClick={finish}
                disabled={!risk}
                className="inline-flex h-9 items-center gap-1.5 rounded-md bg-accent px-4 text-xs font-semibold text-accent-fg hover:bg-accent/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Get recommendations <ArrowRight className="h-3 w-3" strokeWidth={2.5} />
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepPanel({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-base font-semibold text-fg mb-3">{question}</h3>
      {children}
    </div>
  );
}

function ChoiceCard({
  icon, emoji, label, hint, active, onClick,
}: {
  icon: React.ReactNode;
  emoji: string;
  label: string;
  hint: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border p-3 text-left transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-fg'
          : 'border-border bg-bg-elev/30 text-fg-muted hover:text-fg hover:border-accent/30'
      )}
    >
      <div className="flex items-baseline gap-2 mb-1">
        <span className="text-base">{emoji}</span>
        <span className="text-sm font-medium text-fg">{label}</span>
      </div>
      <div className="text-[11px] text-fg-subtle leading-snug">{hint}</div>
      {/* Icon kept off-screen for now — emoji wins for visual scan */}
      <span className="sr-only">{icon}</span>
    </button>
  );
}

function SimpleChoice({
  label, active, onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-3 text-sm font-medium transition-colors',
        active
          ? 'border-accent/50 bg-accent/10 text-accent'
          : 'border-border bg-bg-elev/30 text-fg-muted hover:text-fg hover:border-accent/30'
      )}
    >
      {label}
    </button>
  );
}

function ToneChoice({
  label, tone, active, onClick,
}: {
  label: string;
  tone: 'positive' | 'neutral' | 'negative';
  active: boolean;
  onClick: () => void;
}) {
  const activeCls =
    tone === 'positive' ? 'border-positive/50 bg-positive/10 text-positive' :
    tone === 'negative' ? 'border-warning/50 bg-warning/10 text-warning' :
    'border-accent/50 bg-accent/10 text-accent';
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'rounded-md border px-3 py-3 text-sm font-medium transition-colors',
        active ? activeCls : 'border-border bg-bg-elev/30 text-fg-muted hover:text-fg hover:border-accent/30'
      )}
    >
      {label}
    </button>
  );
}
