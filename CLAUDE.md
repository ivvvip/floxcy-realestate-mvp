# Floxcy Real Estate MVP - Project Context

## Overview
UAE AI-Powered Real Estate Investment Intelligence Platform. Provides Dubai market data, ROI calculations, area comparisons, and AI advisory for real estate investors.

## Architecture
- **Backend**: FastAPI (Python) at https://api.floxcy.com
- **Frontend**: Next.js 14 at https://floxcy.com
- **Database**: PostgreSQL 18 + Redis 7.2 (Coolify-managed)
- **Deploy**: Coolify (https://coolify.floxcy.com)
- **DNS**: Cloudflare (Zone ID: 89ac3a0e622b0d2dce96fc850e4a6c52)
- **Server**: Contabo VPS (185.205.246.175)

## API Tokens & URLs

### Environment variables available:
- `$CLOUDFLARE_API_TOKEN` - DNS management
- `$CLOUDFLARE_ZONE_ID` - floxcy.com zone
- `$COOLIFY_API_TOKEN` - Deployment management
- `$COOLIFY_URL` - https://coolify.floxcy.com
- `gh` (GitHub CLI) - Logged in as ivvvip

## Application UUIDs (Coolify)
- **Backend**: `rx3rr9yceika4jqadpcg9e43`
- **Frontend**: `z1bvg616fblrvs483hqqolyo`

## Project Structure
```
floxcy-realestate-mvp/
├── backend/                # FastAPI app
│   ├── app/
│   │   ├── api/routes/     # Endpoint handlers
│   │   ├── models/         # SQLAlchemy models
│   │   ├── schemas/        # Pydantic schemas
│   │   └── services/       # Business logic
│   ├── alembic/            # DB migrations
│   ├── scripts/            # Seed scripts
│   └── Dockerfile
├── frontend/               # Next.js 14 app
│   ├── src/
│   │   ├── app/            # Pages (App Router)
│   │   ├── components/
│   │   └── lib/            # API client, utils, types
│   └── Dockerfile
└── CLAUDE.md               # This file
```

## API Endpoints (Backend)

### Health
- `GET /health` - Basic health check
- `GET /health/detailed` - Detailed health (DB, Redis status)

### Areas
- `GET /api/v1/areas` - List Dubai areas (supports filters: price range, ROI, type)
- `GET /api/v1/areas/{id}` - Area detail with full data
- `GET /api/v1/areas/stats` - Aggregate market stats across all areas
- `GET /api/v1/areas/compare` - Compare multiple areas side-by-side

### ROI
- `POST /api/v1/roi/calculate` - ROI calculator (price, rent, expenses → returns)

### Dashboard
- `GET /api/v1/dashboard/summary` - Investor dashboard summary data

### AI Advisor
- `POST /api/v1/advisor/query` - AI-powered investment advisor query

### Admin
- `POST /api/v1/admin/seed` - Seed database with sample data

### Docs
- `GET /docs` - Swagger UI

## Frontend Pages

- `/` - Landing page (hero, animated stats, CTAs)
- `/dashboard` - Investor dashboard (market overview, key metrics)
- `/areas` - Areas list with filters (price, ROI, type)
- `/areas/[id]` - Area detail page
- `/compare` - Multi-area comparison view
- `/advisor` - AI investment advisor chat interface
- `/roi-calculator` - ROI calculation tool
- `/admin` - Admin panel (seed data, internal tools)

## Database Tables
- `areas` - 70 Dubai areas (Q1 2026 calibrated): premium/luxury, mid-range, mixed-use/commercial, beachfront, emerging, old Dubai
- `market_snapshots` - 840 records (12 monthly snapshots × 70 areas)
- `alembic_version` - Migration tracking

## Common Tasks

### Deploy after code changes
```bash
git add .
git commit -m "Your message"
git push
# Coolify auto-deploys both apps within 30 seconds
```

### Run database migration on production
```bash
# Edit .env temporarily to use IP (DNS doesn't resolve from host)
cd backend
cp .env .env.backup
sed -i 's|@mc6ih4pibza2t1ug9uhp3z0i:|@10.0.1.7:|g' .env
alembic upgrade head
mv .env.backup .env
```

### Trigger Coolify deployment via API
```bash
# Backend
curl -X POST \
  "$COOLIFY_URL/api/v1/deploy?uuid=rx3rr9yceika4jqadpcg9e43" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"

# Frontend
curl -X POST \
  "$COOLIFY_URL/api/v1/deploy?uuid=z1bvg616fblrvs483hqqolyo" \
  -H "Authorization: Bearer $COOLIFY_API_TOKEN"
```

### Add new DNS record (Cloudflare)
```bash
curl -X POST \
  "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data '{
    "type": "A",
    "name": "subdomain",
    "content": "185.205.246.175",
    "proxied": false
  }'
```

### Seed database via API
```bash
curl -X POST https://api.floxcy.com/api/v1/admin/seed
```

## Tech Stack
- **Backend**: FastAPI 0.115, SQLAlchemy 2.0 async, Pydantic v2, Alembic, asyncpg
- **Frontend**: Next.js 14, TypeScript, Tailwind CSS, App Router, React Server Components
- **DB**: PostgreSQL 18, Redis 7.2
- **Container**: Docker, Coolify
- **CI/CD**: Auto-deploy from GitHub main branch

## Design System (Frontend)
- **Primary bg**: `#0A0E1A` (dark navy)
- **Card bg**: `#131725`
- **Accent**: `#00D4AA` (teal/green - primary CTA, success)
- **Warning**: `#FF6B6B` (red - errors, risks)
- **Text**: `#F8F9FA` (off-white)
- **Theme**: Dark mode first, financial-data aesthetic

## Workflow Notes
- All deploys are automatic on `git push` to main (Coolify webhook)
- Database migrations need manual run with IP workaround (DNS doesn't resolve from host)
- DNS hostname resolution fails on host but works inside Coolify network
- PostgreSQL container IP: `10.0.1.7`

## User Preferences
- Communication: Arabic primary, English for technical terms
- Wants minimal manual intervention
- Prefers automation
- Use `gh` CLI for GitHub operations
- Use Cloudflare API for DNS changes
- Use Coolify API for deployments
