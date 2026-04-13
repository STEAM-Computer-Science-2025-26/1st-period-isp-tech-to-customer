# Tech to Customer

Tech to Customer is an HVAC operations platform for dispatchers, admins, and office teams. It combines a Next.js frontend with a Fastify backend in one repository and supports customer management, job lifecycle tracking, technician dispatch, analytics, and operational workflows.

## What is in this repo

- Admin dashboard with KPI cards and job activity trends
- Customer, job, employee, dispatch, map, calendar, resources, and todo pages
- Dispatch recommendation algorithm with one-by-one and batch assignment flows
- Fastify API with core, analytics, dispatch, integration, and operational route modules
- Neon/Postgres database layer with migration support

## Stack

- Next.js (App Router) + React + TypeScript
- Fastify v5 (backend API)
- TanStack React Query
- Zustand (UI state)
- Tailwind CSS v4 with tokenized theme variables
- Neon serverless PostgreSQL

## Getting started

### First-time setup

```bash
# 1) Install dependencies
pnpm install

# 2) Initialize workspace tooling (Husky, latest deps after pull)
pnpm run init:workspace
```

Then create your local environment file:

```bash
cp .env.example .env.local
```

Fill in required values before running the app (`DATABASE_URL`, `JWT_SECRET`, and any integration keys you need).

### Every time you open the project

```bash
# Sync + install + ensure hooks are active
pnpm run init:workspace

# Start frontend + backend
pnpm dev
```

`init:workspace` runs `git pull`, installs dependencies, and re-initializes Husky so your local dev environment stays consistent.

## Development commands

```bash
# Start frontend + backend
pnpm dev

# Start each server separately
pnpm dev:frontend
pnpm dev:backend

# Build
pnpm build
pnpm build:frontend
pnpm build:backend

# Test
pnpm test

# Lint and format
pnpm lint
pnpm lint:auto-format
pnpm format

# Migrations
pnpm migrate:status
pnpm migrate:up
pnpm migrate:down
pnpm migrate:create
```

## Git workflow (pre-push hook)

This project uses a Husky pre-push hook. On `git push`, it:

1. Verifies there are no uncommitted local changes before running.
2. Runs `pnpm run format`.
3. If formatting changed files, creates a commit with the message `Husky: formatted code` and stops that push.
4. Runs `pnpm run build` when no formatting commit is needed.

If a formatting commit is created, run `git push` again to push that new commit.

## Environment

Copy `.env.example` to `.env.local` and set the required values:

- `DATABASE_URL`
- `JWT_SECRET`
- `NEXT_PUBLIC_FASTIFY_URL` (default local backend is `http://localhost:3001`)
- Any integration keys you need (Stripe, QuickBooks, Google Maps, etc.)

## Architecture overview

### Request flow

1. Browser loads Next.js app on port 3000.
2. Frontend calls API through `apiFetch`.
3. Fastify backend on port 3001 handles auth, business logic, and DB queries.

### Frontend structure

- `app/`: route pages and layouts
- `components/`: shared UI and layout pieces
- `lib/hooks/`: query/mutation hooks
- `lib/api.ts`: centralized API client
- `lib/stores/uiStore.ts`: persisted UI state (sidebar + side panel)
- `app/globals.css`: theme tokens and utility styling

### Backend structure

- `services/server.ts`: bootstraps Fastify and registers all routes
- `services/routes/core`: jobs, users, employees, customers, branches
- `services/routes/analytics`: dashboard, revenue, KPI and reporting APIs
- `services/routes/dispatch`: recommendation + assignment routes
- `services/routes/integrations`: Stripe, QuickBooks, CRM, SMS
- `services/routes/operational`: invoice, estimate, inventory, replacement, etc.

### Database

- DB helpers in `db/index.ts`
- SQL migrations in `db/migrations`
- Raw SQL with parameterized access and camelCase conversion helpers

## Current admin UX highlights

### Jobs page

- Analytics-backed KPI strip (jobs today, unassigned, in progress, completion metrics)
- Search and filter controls (status and priority)
- Readable date/time formatting for scheduled and created timestamps
- Side panel detail preview for rapid triage
- Deep link to full job detail page

### Customers page

- KPI strip for total/active/type/no-show counts
- Search and filter controls (type + status)
- Readable date formatting with relative member age context
- Side panel detail preview (contact, jobs, equipment, locations, comms summary)
- Deep link to full customer profile page

### Dispatch page

- Unassigned queue with search and priority filter
- Select mode for multi-job selection
- Batch recommendation generation (`/dispatch/batch`)
- Batch action banner: "Technicians selected" with `View` and `Assign All`
- `Assign All` persists assignments via backend batch-assign route
- One-by-one dispatch panel with auto-assign and manual override support

### Dispatch review route

- Route: `/dispatch/review`
- Loads batch plan from session storage created by the dispatch page
- Lets admin change technician per job from recommendation options
- Commits final selections through backend batch assign endpoint

## Useful API endpoints

- `GET /jobs?status=unassigned`
- `GET /jobs/:jobId`
- `GET /jobs/:jobId/recommendations`
- `POST /jobs/:jobId/dispatch`
- `POST /jobs/:jobId/assign`
- `POST /dispatch/batch`
- `POST /dispatch/batch/assign`
- `GET /customers`
- `GET /customers/:customerId`
- `GET /analytics/dashboard`
- `GET /analytics/job-kpis`

## Testing and quality

- Jest tests in `tests/`
- Run lint before PRs (`pnpm lint`)
- Use build commands to verify frontend and backend compilation

## Contributing

See `CONTRIBUTING.md` for contributor workflow and codebase conventions.
