# Floxcy Frontend

Next.js 14 (App Router) + TypeScript + Tailwind CSS. Dark, professional UI for the Floxcy Dubai real-estate investment platform.

## Stack

- Next.js 14 (App Router, `output: 'standalone'`)
- React 18, TypeScript (strict)
- Tailwind CSS
- Talks to the FastAPI backend at `NEXT_PUBLIC_API_URL` (default `https://api.floxcy.com`)

## Local development

```bash
cd frontend
npm install
cp .env.example .env.local   # then edit NEXT_PUBLIC_API_URL if needed
npm run dev                  # http://localhost:3000
```

Other scripts:

```bash
npm run build      # production build
npm run start      # serve the production build
npm run lint
npm run typecheck
```

## Project structure

```
frontend/
├── src/
│   ├── app/
│   │   ├── layout.tsx              # root layout (Navbar + Footer)
│   │   ├── page.tsx                # / landing
│   │   ├── globals.css
│   │   ├── not-found.tsx
│   │   ├── areas/
│   │   │   ├── page.tsx            # /areas list
│   │   │   └── [id]/
│   │   │       ├── page.tsx        # /areas/[id] detail
│   │   │       └── not-found.tsx
│   │   └── roi-calculator/
│   │       ├── page.tsx            # /roi-calculator
│   │       └── RoiCalculator.tsx   # client component
│   ├── components/
│   │   ├── Navbar.tsx
│   │   ├── Footer.tsx
│   │   ├── Container.tsx
│   │   ├── Button.tsx
│   │   └── AreaCard.tsx
│   └── lib/
│       ├── api.ts                  # getAreas / getArea / calculateROI
│       ├── types.ts                # Area, ROI request/response
│       ├── format.ts               # AED / % / number formatters
│       └── cn.ts                   # className helper
├── public/
├── Dockerfile                      # multi-stage, runs `node server.js`
├── next.config.js                  # output: 'standalone'
├── tailwind.config.ts
├── postcss.config.js
├── tsconfig.json
└── package.json
```

## Environment

| Variable              | Default                  | Notes                              |
| --------------------- | ------------------------ | ---------------------------------- |
| `NEXT_PUBLIC_API_URL` | `https://api.floxcy.com` | Base URL of the FastAPI backend.   |

`NEXT_PUBLIC_*` vars are baked in at build time — set them in your build/runtime env (Coolify build arg/env) before `npm run build`.

## Docker / Coolify

The `Dockerfile` builds a standalone Next.js server.

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.floxcy.com -t floxcy-frontend ./frontend
docker run -p 3000:3000 floxcy-frontend
```

Coolify deployment is documented in the root README / project notes.
