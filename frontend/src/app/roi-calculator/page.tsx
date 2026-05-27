import type { Metadata } from 'next';
import { Calculator } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { RoiCalculator } from './RoiCalculator';

export const metadata: Metadata = {
  title: 'ROI Calculator',
  description:
    'Model gross yield, net yield, and payback period for any UAE property in seconds.',
};

export default function RoiCalculatorPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'ROI Calculator' }]} />
            <div className="mt-2 flex items-end justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    ROI Calculator
                  </h1>
                </div>
                <p className="mt-1 text-xs text-fg-muted">
                  Model gross yield, net yield, and payback for any UAE property
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <RoiCalculator />
        </div>
      </Container>
    </div>
  );
}
