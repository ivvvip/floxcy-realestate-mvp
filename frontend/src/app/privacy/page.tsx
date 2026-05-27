import { Container } from '@/components/Container';
import { Breadcrumbs } from '@/components/nav/Breadcrumbs';

export const metadata = {
  title: 'Privacy',
  description: 'Floxcy privacy policy.',
};

export default function PrivacyPage() {
  return (
    <div className="bg-bg">
      <div className="border-b border-border">
        <Container>
          <div className="pt-4 pb-3">
            <Breadcrumbs items={[{ label: 'Privacy' }]} />
            <h1 className="mt-2 text-xl font-semibold text-fg tracking-tight">
              Privacy policy
            </h1>
            <p className="mt-1 text-xs text-fg-muted tabular">
              Effective 2026-05-28 · v0.1
            </p>
          </div>
        </Container>
      </div>

      <Container>
        <div className="py-6 max-w-3xl space-y-6 text-sm text-fg-muted leading-relaxed">
          <section>
            <h2 className="text-base font-semibold text-fg">What we collect</h2>
            <ul className="mt-2 space-y-2">
              <li>
                <strong className="text-fg">Anonymous usage:</strong> request
                logs (path, status, timing), aggregated for capacity and
                abuse monitoring. Retained 90 days.
              </li>
              <li>
                <strong className="text-fg">Cookie session ID:</strong> a
                random opaque identifier used to bind investor alerts to your
                browser. Not linked to identity.
              </li>
              <li>
                <strong className="text-fg">Account credentials:</strong> for
                admin/analyst/viewer users only — username, email (optional),
                bcrypt-hashed password, role, last-login timestamp.
              </li>
              <li>
                <strong className="text-fg">API key metadata:</strong> name,
                tier, rate limit, last-used timestamp; the key itself is stored
                only as a bcrypt hash.
              </li>
              <li>
                <strong className="text-fg">Audit log:</strong> every
                authenticated action (login, key creation, data reseed) is
                recorded with actor, action, target, IP, and timestamp.
                Retained 1 year.
              </li>
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">What we do NOT collect</h2>
            <ul className="mt-2 space-y-2">
              <li>No third-party analytics (no Google Analytics, no pixels).</li>
              <li>No advertising identifiers, no cross-site tracking.</li>
              <li>No payment information yet (no payment processor integrated).</li>
              <li>No personal data is sold or shared with third parties.</li>
            </ul>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Where data lives</h2>
            <p className="mt-2">
              All data is stored on EU/UAE-region servers (Contabo VPS, EU
              data centers). Database is PostgreSQL with at-rest encryption at
              the volume level. Transport is HTTPS only (HSTS enabled).
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Your rights</h2>
            <p className="mt-2">
              You may request deletion of your account, alerts, or audit-log
              entries by contacting the operator. Anonymous session-bound
              alerts are deleted when their cookie expires (1 year by default)
              or when you clear cookies for floxcy.com.
            </p>
          </section>
          <section>
            <h2 className="text-base font-semibold text-fg">Security</h2>
            <p className="mt-2">
              We use industry-standard practices: bcrypt for credentials,
              HTTP-only secure cookies for sessions, JWT-signed tokens with
              short TTL, rate limiting per IP/key, strict security headers
              (CSP, HSTS, X-Frame-Options), and a full audit trail for
              privileged actions. No security system is perfect; report
              vulnerabilities to the operator.
            </p>
          </section>
        </div>
      </Container>
    </div>
  );
}
