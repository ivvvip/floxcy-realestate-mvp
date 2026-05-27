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

API uses `X-API-Key` header for key-based auth. All authenticated routes also accept
the JWT cookie when set.

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
