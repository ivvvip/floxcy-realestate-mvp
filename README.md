# Floxcy — UAE Real Estate Investment Intelligence

> Institutional-grade market intelligence for UAE property investors. Transparent
> scoring, confidence-aware data, public API, audit-logged admin operations.

**Production:** [floxcy.com](https://floxcy.com) · API: [api.floxcy.com/docs](https://api.floxcy.com/docs)

---

## What's in the box

| Capability | Where |
|---|---|
| Market dashboard, area screener, ROI calculator | Frontend (`/frontend`) |
| **Undervalued Area Detector** (killer feature) | `/opportunities` page + `/api/v1/opportunities` |
| **Data Confidence layer** on every metric | `ConfidenceBadge` component + `/api/v1/areas/{id}/confidence` |
| **AI Investment Analyst** (rules-based multi-factor) | `/advisor` page + `/api/v1/advisor/query` |
| **Investor alerts** (in-app, ready for email/WhatsApp) | `AlertCreator` + `/api/v1/alerts` |
| **Methodology** (machine + human readable) | `/methodology` page + `/api/v1/methodology` |
| **Admin** with login, RBAC, audit log, API key management | `/admin/*` + `/api/v1/admin/*` |
| **Trust pages**: about, data-sources, api, pricing, privacy, terms | All public routes |
| **Subscription tier scaffold** (free/pro/api/enterprise) | `src/lib/plans.ts` + `/pricing` page |
| **Supply layer**: verified brokers, curated deals, lead matching, consultation flow | `/opportunities`, `/brokers/apply`, `/broker/dashboard`, `/admin/{brokers,opportunities,leads}` |
| **Tests** for ROI, confidence, undervaluation, security | `backend/tests/` |

---

## Architecture

- **Backend** — FastAPI (Python 3.12) + SQLAlchemy 2 async + PostgreSQL 18 + Redis 7
- **Frontend** — Next.js 14 (App Router) + TypeScript + Tailwind 3 + Recharts
- **Auth** — JWT in httpOnly cookies (sessions) + bcrypt-hashed API keys (machine)
- **Rate limiting** — Redis-backed sliding window, per-tier limits
- **Security** — CSP, HSTS, X-Frame-Options, audit log, rate limiting on `/auth/login`
- **Deploy** — Coolify on Contabo VPS, auto-deploy on `git push` to `main`

```
floxcy-realestate-mvp/
├── backend/                       # FastAPI app
│   ├── app/
│   │   ├── api/routes/            # health, auth, areas, roi, dashboard, compare,
│   │   │                          # advisor, admin, opportunities, rankings,
│   │   │                          # alerts, methodology
│   │   ├── core/                  # security (bcrypt, JWT, API keys),
│   │   │                          # dependencies (auth + RBAC),
│   │   │                          # middleware (CSP/HSTS, request log),
│   │   │                          # rate_limit (Redis), audit
│   │   ├── models/                # SQLAlchemy: Area, MarketSnapshot, User,
│   │   │                          # ApiKey, AuditLog, Alert
│   │   ├── services/              # roi_calculator, advisor, confidence,
│   │   │                          # undervaluation, seed_data, bootstrap
│   │   └── schemas/               # Pydantic v2 request/response models
│   ├── alembic/versions/          # DB migrations
│   ├── tests/                     # pytest: ROI, confidence, undervaluation, security
│   ├── requirements.txt
│   └── pytest.ini
├── frontend/                      # Next.js 14 app
│   ├── src/
│   │   ├── app/                   # All pages (server + client components)
│   │   ├── components/            # Shared UI components (data, nav, charts)
│   │   ├── lib/                   # api client, types, formatters, plans, insights
│   │   └── middleware.ts          # Guards /admin/* behind login
│   ├── next.config.js             # Security headers, standalone build
│   └── tailwind.config.ts
├── CLAUDE.md                      # Project context for AI assistants
└── README.md                      # This file
```

---

## Supply layer: brokers & curated deals

Floxcy is **not** a generic property portal. It's an investor intelligence
platform with a curated supply side bolted on. Two kinds of opportunities
live under the same `/opportunities` feed:

- **Area signals** (`kind: area_signal`) — computed by `opportunity_engine`
  from the 70-area + 12-month snapshot universe. No broker, no specific
  unit; it's the market telling us where to look.
- **Broker deals** (`kind: broker_deal`) — specific units submitted by
  verified UAE investment specialists, scored by `deal_scoring`, and
  *admin-approved before publication*. Every deal carries broker identity,
  required investment thesis, required risks, expected yield, strategy,
  and confidence — these gate approval.

### Database models (supply layer)

| Table | Purpose |
|---|---|
| `brokers` | Approved investment specialists. RERA license, languages, specialist areas, status, performance/response scores, optional password hash for `/broker/login`. |
| `broker_applications` | Public submissions awaiting admin review. Retained as audit trail post-decision. |
| `investment_opportunities` | Broker-submitted (or manual/developer) deals. Distinct from area signals; merge happens at the API layer. |
| `investor_leads` | Inbound investor interest, optionally tied to an opportunity and a matched broker. `lead_score` 0–100 from `lead_scoring` heuristic. |
| `consultations` | Join row between a lead and a broker, optionally referencing the originating opportunity. |

All FKs use `ON DELETE SET NULL` (or `CASCADE` on `consultations.investor_lead_id`).

### Broker flow

1. `/brokers/apply` — public application form. Creates a row in
   `broker_applications` (idempotent on email for pending rows).
2. Admin reviews at `/admin/brokers` and clicks **Approve** — creates a
   `brokers` row and returns a one-time temp password (or accepts an
   admin-supplied one).
3. Broker logs in at `/broker/login`, lands on `/broker/dashboard`:
   - **My opportunities** tab — every submission and its status.
   - **My leads** tab — investors matched to their deals; broker
     transitions status (`new → contacted → qualified → ...`).
   - **Submit new** tab — investment-case form. Yield, confidence,
     strategy, risk, thesis, risk summary are required. Submission lands
     in `pending_review`; the broker cannot publish directly.
4. Admin reviews at `/admin/opportunities`, approves or rejects. On
   approval, `deal_scoring.score_and_apply` re-runs against the latest
   area context and the deal becomes visible on the public feed.

### Investor flow

1. `/opportunities` — unified card feed. Filter by area, strategy, min
   score; toggle between **All / Curated Deals / Market Signals**.
2. Card → `/opportunities/[id]` (broker deals) or `/areas/[id]` (signals).
   Deal detail is laid out as an **investment case**, not a listing:
   thesis, risks, best-for, verified-specialist card, and an inline
   consultation form.
3. **Request Consultation** → creates an `investor_leads` row and a
   `consultations` row, assigns to the deal's broker, returns the success
   envelope.
4. Generic interest (not tied to a specific deal) goes through
   `/consultation` instead and lands in the same lead queue with
   `opportunity_id = NULL`.

Every lead is scored on submission (0–100) so admins / brokers triage
the hottest leads first at `/admin/leads`.

### n8n hooks

`POST /api/v1/webhooks/{new-lead,broker-approved,opportunity-approved}` —
stable URLs n8n can point at for downstream automation (WhatsApp, email,
CRM sync). Signature-verified against `N8N_WEBHOOK_SECRET` when set; logs
and acks otherwise. The outbound automation itself is intentionally
deferred — these are placeholders.

---

## Local setup

### Prerequisites

- Docker + docker-compose (for Postgres + Redis)
- Python 3.12+
- Node.js 20+
- `gh` CLI (optional, for GitHub ops)

### Backend

```bash
cd backend

# 1. Create virtualenv + install
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# 2. Configure environment
cp .env.example .env  # or write one — see "Environment variables" below

# 3. Run migrations
alembic upgrade head

# 4. (Optional) Seed sample market snapshots
# Once logged in as admin, POST /api/v1/admin/seed

# 5. Start the API
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

API runs at `http://localhost:8000`. Swagger UI at `/docs`.

### Frontend

```bash
cd frontend
npm install
echo "NEXT_PUBLIC_API_URL=http://localhost:8000" > .env.local
npm run dev
```

App runs at `http://localhost:3000`.

### Run tests

```bash
cd backend
pytest -v
```

---

## Environment variables

### Backend (`.env`)

| Variable | Required | Default | Purpose |
|---|---|---|---|
| `DATABASE_URL` | yes | — | e.g. `postgresql+asyncpg://user:pwd@host:5432/floxcy` |
| `REDIS_URL` | yes | — | e.g. `redis://host:6379/0` |
| `JWT_SECRET` | yes (prod) | `change-me-jwt` | Cookie signing secret. Long random string. |
| `JWT_TTL_MINUTES` | no | `480` | Session lifetime |
| `BOOTSTRAP_ADMIN_USERNAME` | recommended | — | Creates admin on first boot |
| `BOOTSTRAP_ADMIN_PASSWORD` | recommended | — | Used together with above |
| `COOKIE_SECURE` | no | `True` | Set `False` only in HTTP-only dev |
| `COOKIE_DOMAIN` | no | `""` | e.g. `.floxcy.com` for shared cookie across subdomains |
| `CORS_ORIGINS` | no | `["http://localhost:3000", "https://floxcy.com"]` | Comma-separated list when set as env var |
| `RATE_LIMIT_ANONYMOUS_PER_MIN` | no | `60` | Anonymous rate limit |
| `RATE_LIMIT_*_PER_MIN` | no | varies | Per-tier overrides |
| `ENVIRONMENT` | no | `development` | `production` enables HSTS |
| `DEBUG` | no | `True` | SQLAlchemy echo + FastAPI debug |
| `ADMIN_API_KEY` | legacy | `change-me` | Kept only for backward compatibility — new mechanism uses login |
| `N8N_WEBHOOK_SECRET` | no | `""` | Shared secret for HMAC-SHA256 on `/webhooks/*`. Empty = accept unsigned (dev only). |

### Frontend (`.env.local`)

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_API_URL` | Base URL of the backend API |

### Coolify production env

Set these on the **backend** Coolify app:

```
DATABASE_URL=postgresql+asyncpg://...
REDIS_URL=redis://...
JWT_SECRET=<long random string — generate with `openssl rand -hex 32`>
BOOTSTRAP_ADMIN_USERNAME=<your-admin-username>
BOOTSTRAP_ADMIN_PASSWORD=<a-strong-password>
ENVIRONMENT=production
COOKIE_DOMAIN=.floxcy.com
CORS_ORIGINS=["https://floxcy.com"]
N8N_WEBHOOK_SECRET=<long random string when wiring n8n>
```

Set these on the **frontend** Coolify app:

```
NEXT_PUBLIC_API_URL=https://api.floxcy.com
```

The admin bootstrap is idempotent: changing `BOOTSTRAP_ADMIN_PASSWORD` and
redeploying will rotate the admin password automatically.

---

## API surface

| Endpoint | Auth | Purpose |
|---|---|---|
| `POST /api/v1/auth/login` | none | Username/password → cookie session |
| `POST /api/v1/auth/logout` | session | Clear cookie |
| `GET /api/v1/auth/me` | session | Current user |
| `GET /api/v1/areas` | optional | List areas + latest metrics |
| `GET /api/v1/areas/{id}` | optional | Area detail + 12mo history |
| `GET /api/v1/areas/{id}/confidence` | optional | **Confidence breakdown** |
| `GET /api/v1/areas/stats` | optional | Aggregate stats |
| `GET /api/v1/areas/compare?ids=...` | optional | Multi-area comparison |
| `POST /api/v1/roi/calculate` | optional | ROI calculator |
| `GET /api/v1/dashboard/summary` | optional | Aggregated dashboard data |
| `POST /api/v1/advisor/query` | optional | AI investment analyst |
| `GET /api/v1/opportunities` | optional | **Undervalued Area Detector** |
| `GET /api/v1/rankings?by=...` | optional | Sorted area rankings |
| `GET /api/v1/alerts` | cookie/user | List alerts |
| `POST /api/v1/alerts` | cookie/user | Create alert |
| `DELETE /api/v1/alerts/{id}` | cookie/user | Delete alert |
| `GET /api/v1/methodology` | none | Machine-readable methodology doc |
| `POST /api/v1/admin/seed` | role=admin | Re-seed market snapshots |
| `GET /api/v1/admin/users` | role=admin | List users |
| `GET /api/v1/admin/api-keys` | role=admin | List API keys |
| `POST /api/v1/admin/api-keys` | role=admin | Issue API key |
| `POST /api/v1/admin/api-keys/{id}/revoke` | role=admin | Revoke key |
| `GET /api/v1/admin/audit-log` | role=analyst | View audit log |
| `GET /api/v1/opportunities?kind=all\|signals\|deals` | optional | **Unified opportunity feed** |
| `GET /api/v1/opportunities/deals/{id}` | optional | Broker-deal detail |
| `POST /api/v1/opportunities/deals/{id}/request-consultation` | optional | Tied lead + consultation |
| `POST /api/v1/consultations/request` | optional | Generic (non-deal) consultation request |
| `POST /api/v1/brokers/apply` | optional | Public broker application |
| `POST /api/v1/broker/login` | none | Broker email+password → bearer token |
| `GET /api/v1/broker/me` | bearer | Current broker |
| `GET\|POST\|PATCH /api/v1/broker/opportunities[/{id}]` | bearer | Broker's own deals |
| `GET\|PATCH /api/v1/broker/leads[/{id}]` | bearer | Broker's assigned leads |
| `GET /api/v1/admin/broker-applications` | role=admin | Pending broker applications |
| `POST /api/v1/admin/broker-applications/{id}/{approve\|reject}` | role=admin | Application review |
| `GET\|PATCH /api/v1/admin/brokers[/{id}]` | role=admin | Approved-broker management |
| `GET /api/v1/admin/opportunities/pending` | role=admin | Deals awaiting review |
| `POST /api/v1/admin/opportunities/{id}/{approve\|reject}` | role=admin | Approval (QC-guarded) |
| `PATCH /api/v1/admin/opportunities/{id}` | role=admin | Admin override |
| `GET\|PATCH /api/v1/admin/leads[/{id}]` | role=admin | Investor leads + broker assignment |
| `POST /api/v1/webhooks/{new-lead\|broker-approved\|opportunity-approved}` | HMAC | n8n placeholders |

API uses `X-API-Key` header for key-based auth. All authenticated routes also accept
the JWT cookie when set. Broker routes use `Authorization: Bearer <token>` where
`<token>` is the JWT returned by `POST /api/v1/broker/login`.

---

## Security model

- **Passwords** — bcrypt cost 12; never logged.
- **Sessions** — JWT with 8h TTL in httpOnly+secure+samesite=lax cookie.
- **API keys** — `fxc_live_<24chars>`. Stored as bcrypt hash; lookup by prefix.
  Shown to user **once** on creation.
- **Rate limiting** — Redis-backed per IP (anonymous) or per key (auth).
  Stricter limit on `/auth/login` (10/min).
- **CORS** — explicit allowlist, credentials enabled only for declared origins.
- **Security headers** — applied by both frontend (`next.config.js`) and backend
  (`SecurityHeadersMiddleware`): CSP, HSTS, X-Frame-Options=DENY,
  X-Content-Type-Options=nosniff, strict Referrer-Policy, Permissions-Policy.
- **Audit log** — every privileged action (login, logout, seed, key creation,
  revocation) is logged with actor, action, target, IP, user-agent, timestamp.
  Retained 1 year.
- **No stack traces** in production responses — every unhandled exception is
  logged server-side and returns a generic `{"error": "internal_error"}`.

---

## Deployment

- `git push origin main` triggers Coolify auto-deploy for both apps (~30s).
- Backend container runs `alembic upgrade head` then `uvicorn`.
- Frontend container is a `next start` standalone build.

Migrations must be run when adding tables; the next.config.js standalone
output handles the frontend deploy.

```bash
# Force trigger Coolify deploys via API
curl -X POST "$COOLIFY_URL/api/v1/deploy?uuid=rx3rr9yceika4jqadpcg9e43" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

curl -X POST "$COOLIFY_URL/api/v1/deploy?uuid=z1bvg616fblrvs483hqqolyo" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```

---

## Product principles

These are baked into the codebase, not just docs:

1. **Don't fake certainty.** Every metric carries a confidence score. When
   confidence is low, the UI surfaces an explicit warning.
2. **No black-box AI.** Every score, every recommendation, every formula is
   reproducible. The `/methodology` endpoint is the source of truth.
3. **Every recommendation includes** reason, risk, confidence, source, and
   last-updated time. This is enforced by the schema (see `OpportunityResult`).
4. **Not investment advice.** The disclaimer is prominent on every page that
   produces a recommendation.
5. **Authentication-by-default for admin.** No bare tokens in frontend code.

---

## Roadmap

- Email/WhatsApp/Telegram delivery for alerts
- Real payment integration (Stripe / Tap)
- Public user accounts (currently admin-only auth)
- Webhook delivery for API tier
- GCC market expansion (KSA, Qatar)
- Off-plan transaction support
- Live deal flow integration
