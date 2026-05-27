import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';

export const metadata = {
  title: 'Terms of Use',
  description: 'Floxcy terms of use and financial disclaimer.',
};

export default function TermsPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Terms' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Terms of use
            </h1>
            <p className="mt-1 text-xs text-fg-muted tabular">
              Effective 2026-05-28 · v0.1
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 max-w-3xl space-y-6 text-sm text-fg-muted leading-relaxed">
          <section className="border border-warning/30 bg-warning/10 rounded-lg p-4">
            <h2 className="text-base font-semibold text-warning">
              Not investment advice
            </h2>
            <p className="mt-2 text-fg">
              Floxcy provides market intelligence derived from public and
              licensed UAE real-estate data. Every score, ranking, and
              recommendation on this platform is computed from observable
              metrics — it is <strong>NOT</strong> investment, legal, tax, or
              financial advice. Real estate transactions involve significant
              risk. Past performance does not guarantee future returns.
              Always consult a licensed real-estate advisor, financial
              advisor, and tax counsel before deploying capital.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Acceptable use</h2>
            <ul className="mt-2 space-y-2">
              <li>
                You may use Floxcy for research, due diligence, and internal
                decision support. Re-publication of bulk data requires written
                permission.
              </li>
              <li>
                Automated scraping outside the documented API is prohibited.
                Use the public API with a valid key.
              </li>
              <li>
                Do not attempt to circumvent rate limits, authentication, or
                any other technical control.
              </li>
              <li>
                Do not represent Floxcy output as your own original research
                without attribution.
              </li>
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">API tiers and limits</h2>
            <p className="mt-2">
              API usage is governed by the tier of the API key in use. Tier
              limits are listed on the{' '}
              <a href="/api" className="text-accent hover:underline">/api</a>{' '}
              page. We reserve the right to throttle, revoke, or rate-limit
              keys that exceed reasonable usage or breach acceptable-use
              terms.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Liability</h2>
            <p className="mt-2">
              Floxcy is provided <em>as is</em>, without warranty of any kind.
              We make no guarantee of accuracy, completeness, or fitness for a
              particular purpose. To the maximum extent permitted by law, we
              shall not be liable for any direct, indirect, incidental, or
              consequential damages arising from use of this platform.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Governing law</h2>
            <p className="mt-2">
              These terms are governed by the laws of the United Arab
              Emirates. Disputes shall be resolved in Dubai courts.
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}
