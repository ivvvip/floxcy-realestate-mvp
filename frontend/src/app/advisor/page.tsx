import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { Sparkles } from 'lucide-react';
import { AdvisorClient } from './AdvisorClient';

export const metadata = {
  title: 'AI Investment Analyst',
  description:
    'Match your capital to UAE real estate opportunities. Multi-factor ranking with transparent reasoning.',
};

export default function AdvisorPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'AI Analyst' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-accent" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    AI Investment Analyst
                  </h1>
                  <span className="pill pill-accent">Beta</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Multi-factor ranking engine · budget &middot; goal &middot; risk &rarr; ranked UAE areas with rationale
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <AdvisorClient />
        </div>
      </Container>
    </div>
  );
}
