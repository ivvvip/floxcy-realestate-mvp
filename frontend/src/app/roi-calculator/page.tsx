import type { Metadata } from 'next';
import { Calculator } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { RoiCalculator } from './RoiCalculator';
import { getCanonicalAreas } from '@/lib/api';

export const metadata: Metadata = {
  title: 'ROI Calculator',
  description:
    'Comprehensive 12-section ROI for any Dubai property — defaults auto-fill '
    + 'from real DLD data. Cash or mortgage, full cost breakdown, scenarios, '
    + 'sensitivity, multi-currency.',
};

export const revalidate = 3600;

export default async function RoiCalculatorPage() {
  // Pre-fetch all canonical areas so the combobox can search across the
  // full 284-area universe. Falls back to empty list if API hiccups.
  let areaOptions: { name: string; name_norm: string }[] = [];
  try {
    const r = await getCanonicalAreas({ min_occurrences: 0 });
    areaOptions = r.items
      .map((a) => ({ name: a.area_name, name_norm: a.area_name_upper }))
      .sort((a, b) => a.name.localeCompare(b.name));
  } catch {
    // empty list — combobox renders "No matches"
  }

  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'ROI Calculator' }]} />
            <div className="mt-2 flex items-end justify-between gap-3 flex-wrap">
              <div>
                <div className="flex items-center gap-2">
                  <Calculator className="h-4 w-4 text-fg-muted" strokeWidth={2} />
                  <h1 className="text-xl font-semibold text-fg tracking-tight">
                    ROI Calculator
                  </h1>
                  <span className="pill pill-accent text-[10px]">DLD-powered</span>
                </div>
                <p className="mt-1 text-xs text-fg-muted max-w-2xl">
                  Full 12-section investment analysis — defaults pre-fill from real
                  DLD market data for the area you pick. Cash or mortgage. Multi-currency.
                  Print or save as PDF.
                </p>
              </div>
            </div>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-5">
          <RoiCalculator areaOptions={areaOptions} />
        </div>
      </Container>
    </div>
  );
}
