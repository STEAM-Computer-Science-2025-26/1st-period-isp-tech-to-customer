# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (runs both frontend :3000 and backend :3001 concurrently)
pnpm dev

# Individual servers
pnpm dev:frontend    # Next.js on port 3000
pnpm dev:backend     # Fastify on port 3001

# Build
pnpm build           # Build both frontend and backend
pnpm build:frontend  # Prettier check + Next.js build
pnpm build:backend   # TypeScript compile (tsconfig.backend.json)

# Testing
pnpm test            # Jest (runs serially with --runInBand)

# Linting & Formatting
pnpm lint            # ESLint + Prettier check
pnpm lint:auto-format  # ESLint fix + Prettier auto-format
pnpm format          # Prettier format only

# Database migrations
pnpm migrate:status
pnpm migrate:up
pnpm migrate:down
pnpm migrate:create
```

## Architecture

This is an **HVAC management system** for technician dispatch and job assignment. It's a hybrid monorepo with a Next.js frontend and a separate Fastify backend.

### Request Flow

1. Browser calls `/api/*` on Next.js (:3000)
2. `next.config.ts` rewrites these to Fastify at `NEXT_PUBLIC_FASTIFY_URL` (default: `:3001`), stripping the `/api` prefix
3. Fastify handles authentication, business logic, and DB queries

### Frontend (`app/`, `components/`, `lib/`)

- **Next.js App Router** with file-based routing. Pages: `login`, `jobs`, `employees`, `customers`, `dispatch`, `map`, `calendar`, `resources`, `todo`
- **State management**: Zustand (`lib/stores/uiStore.ts`) for UI state (sidebar, panels) persisted to localStorage; React Query for all server data
- **API client**: `lib/api.ts` (`apiFetch`) — auto-attaches JWT Bearer token from localStorage; `lib/auth.ts` manages token lifecycle
- **Styling**: Tailwind CSS v4. Dynamic color patterns are safelisted in `tailwind.config.ts`

### Backend (`services/`)

- **Fastify v5** with 50+ route modules registered in `services/server.ts`
- Routes are organized by domain: core (`jobs`, `users`, `employees`, `customers`), analytics (`kpi`, `leaderboard`, `forecast`), integrations (`stripe`, `qbRoutes` for QuickBooks, `sms`, `crm`), dispatch (`dispatch`, `dispatchAudit`, `preStaffingAlert`), operational (`pricebook`, `estimate`, `invoice`)
- **Auth**: JWT via `@fastify/jwt`. Protected routes use `fastify.authenticate` as a preHandler. Token claims are in `request.user`
- **Background workers**: Geocoding workers in `services/workers/` run on intervals (customer geocoding every 30s)

### Database (`db/`)

- **Neon serverless PostgreSQL**. Raw SQL via Neon's `sql.unsafe()` with `$1, $2` parameter interpolation
- `db/index.ts` provides `queryOne`, `queryAll` helpers and automatic snake_case → camelCase conversion
- Migrations in `db/migrations/` managed by `node-pg-migrate`

### Types (`types/`, `services/types/`)

Shared TypeScript types live in `services/types/` (e.g., `jobTypes`, `employeeTypes`, `userTypes`) and are used across both frontend and backend. The `types/` root directory contains ambient type declarations.

### Key Integrations

- **Stripe**: Webhook handling via raw body parsing
- **QuickBooks**: OAuth flow via Intuit OAuth + `node-quickbooks`
- **Google Maps**: `@googlemaps/js-api-loader` + `@vis.gl/react-google-maps`
- **SMS/CRM**: Dedicated route modules

## Environment

Copy `.env.example` to `.env.local` and fill in:
- `DATABASE_URL` — Neon PostgreSQL connection string
- `JWT_SECRET` — Secret for signing JWTs
- `NEXT_PUBLIC_FASTIFY_URL` — Fastify server URL (defaults to `http://localhost:3001`)
- Stripe, QuickBooks, Google Maps API keys as needed

## Testing

Tests live in `tests/` and match `**/tests/**/*.test.ts`. Jest uses `ts-jest` with a 30-second timeout. Global setup/teardown files are `.mjs` files in the project root (`jest.globalSetup.mjs`, etc.).
