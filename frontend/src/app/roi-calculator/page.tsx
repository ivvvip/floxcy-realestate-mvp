import type { Metadata } from 'next';
import { Calculator } from 'lucide-react';
import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';
import { RoiCalculator } from './RoiCalculator';
import { getAllAreas } from '@/lib/api';

export const metadata: Metadata = {
  title: 'ROI Calculator',
  description:
    'Comprehensive 12-section ROI for any Dubai property — defaults auto-fill '
    + 'from real DLD data. Cash or mortgage, full cost breakdown, scenarios, '
    + 'sensitivity, multi-currency.',
};

export const revalidate = 3600;

export default async function RoiCalculatorPage() {
  // Source the combobox from areas that actually have DLD price data, so every
  // selection pre-fills a real benchmark and produces an accurate ROI. Bare
  // canonical names with no price/rent (the rest of the 284) can't pre-fill and
  // only confuse the calculator. Data-rich (full-coverage) areas list first.
  // Include areas with full or partial DLD coverage — the same classification
  // /areas and /compare use, so the ROI list is consistent with them. We filter
  // on coverage_tier (not the list's median_price field) because crowded
  // marketing areas like JVC resolve their price on the detail page even though
  // the list-level metric is null; tier 'partial' captures them. 'limited' and
  // 'none' are too thin for a meaningful ROI pre-fill.
  const TIER_RANK: Record<string, number> = { full: 0, partial: 1 };
  let areaOptions: { name: string; name_norm: string }[] = [];
  try {
    const r = await getAllAreas({ sort_by: 'name' });
    areaOptions = r.items
      .filter((a) => a.coverage_tier === 'full' || a.coverage_tier === 'partial')
      .sort(
        (a, b) =>
          (TIER_RANK[a.coverage_tier] ?? 9) - (TIER_RANK[b.coverage_tier] ?? 9) ||
          a.name.localeCompare(b.name),
      )
      // name_norm = lowercased DLD name so the combo can match marketing
      // synonyms (JVC, Dubai Marina, Downtown) and show the alias hint.
      .map((a) => ({ name: a.name, name_norm: a.name.toLowerCase() }));
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
