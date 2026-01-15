
# Contributing

This codebase is a **Next.js** app written in **TypeScript** (a typed version of JavaScript) and **React** (UI components), styled with **Tailwind CSS**.

If you’re new to TypeScript/Next.js:

- **`.ts`** files are TypeScript (logic, helpers, types).
- **`.tsx`** files are TypeScript + JSX (React UI components).
- **Next.js App Router** uses the `app/` folder as the source of routes (pages) and layouts.

## Quick Start (Local Dev)

1. Install dependencies:

	 ```bash
	 npm install
	 ```

2. Configure environment variables:

	 - Copy `.env.example` to `.env.local`
	 - Fill in required values (notably `DATABASE_URL` for Neon/Postgres)

3. Run the dev server:

	 ```bash
	 npm run dev
	 ```

4. Lint the project:

	 ```bash
	 npm run lint
	 ```

### Database (Neon/Postgres)

- Schema is defined in `server/db/schema.sql`.
- DB connection helpers live in `server/db/connection.ts`.
- You can test DB connectivity with:

	```bash
	npx tsx server/db/test-connection.ts
	```

## Project Structure Overview

This section is meant to answer, “Where do I put my code?”

### Top-level

- `app/` — Next.js routes, layouts, and app-wide styles (main entrypoint for the UI).
- `components/` — Reusable React components (layout, feature UI, and UI primitives).
- `lib/` — Shared application code (types, helpers, errors, hooks, auth utilities).
- `server/` — Server-side utilities (database connection, schema, future API/middleware).
- `public/` — Static assets served as-is (images, icons, etc.).
- `README.md` — General “how to run” information (currently the default create-next-app text).
- `API_DOCS.md` — Reserved for API documentation (currently empty).

### `app/` (Next.js App Router)

Next.js builds your URL routes from the folder structure inside `app/`.

- `app/layout.tsx`
	- The **root layout** for the entire app.
	- Sets global metadata and wraps every page.
- `app/page.tsx`
	- The **home page** (`/`).
	- Note the `"use client"` directive: it makes this file a **Client Component**.
- `app/globals.css`
	- Global CSS.
	- This project defines CSS variables (colors/fonts) and uses Tailwind.

#### Route groups: `app/(auth)/`

Folders wrapped in parentheses are **route groups**: they help organize code but do **not** appear in the URL.

- Example: `app/(auth)/login/page.tsx` would still become `/login`.

#### API routes: `app/api/`

Next.js API endpoints (Route Handlers) normally live under `app/api/**/route.ts`.

This repository contains placeholders:

- `app/api/auth/`
- `app/api/employees/`
- `app/api/jobs/`

To add an endpoint, create a `route.ts` file in the appropriate folder.

Example shape:

```ts
// app/api/jobs/route.ts
import { NextResponse } from "next/server";

export async function GET() {
	return NextResponse.json({ ok: true });
}
```

### `components/`

React UI components live here. The folders are organized by feature area and UI concerns:

- `components/layout/`
	- App shell components such as headers and sidebars.
	- Examples: `Header.tsx`, `Sidebar.tsx`.
- `components/ui/`
	- Reserved for “design system” primitives (buttons, inputs, modals, etc.).
	- Currently empty.
- `components/dashboard/`, `components/jobs/`, `components/calendar/`, `components/maps/`
	- Feature-focused components.
	- Currently empty placeholders (add feature UI here as it’s built).

When adding a new component:

- If it is reused across multiple pages/features, prefer `components/ui/` or `components/layout/`.
- If it is specific to one feature, put it under that feature folder.

### `lib/`

Shared “application code” that isn’t directly a component.

- `lib/types/`
	- TypeScript type definitions for data models and API contracts.
	- Examples: `userTypes.ts`, `jobTypes.ts`, `employeeTypes.ts`, `companyTypes.ts`.
	- These are good places to define “DTOs” (Data Transfer Objects) that represent the shapes returned by APIs.
- `lib/publicErrors.ts`
	- Maps internal error codes to user-friendly messages/actions.
- `lib/constants.ts`
	- Reserved for shared constants (currently empty).
- `lib/auth/`, `lib/hooks/`, `lib/utils/`
	- Reserved for auth helpers, React hooks, and general utilities (currently empty placeholders).

#### A note on imports

This project supports a path alias:

- `@/*` maps to the repository root (configured in `tsconfig.json`).

Example:

```ts
import Sidebar from "@/components/layout/Sidebar";
```

### `server/`

Server-only code and utilities.

- `server/db/`
	- Database schema (`schema.sql`) and Neon connection + query helpers (`connection.ts`).
	- Contains small utilities to convert `snake_case` DB results into `camelCase` objects used in TypeScript.
- `server/api/`
	- Reserved for server-side API logic (currently empty).
- `server/middleware/`
	- Reserved for server-side middleware (currently empty).
- `server/types/`
	- Reserved for server-only types (currently empty).

## Where to Add Things (Common Tasks)

- **Add a new page/route**: create `app/<route>/page.tsx`.
- **Add a shared layout**: create `app/<route>/layout.tsx`.
- **Add an API endpoint**: create `app/api/<area>/route.ts`.
- **Add/extend a data model contract**: update or add a file in `lib/types/`.
- **Add a reusable UI piece**: add to `components/ui/`.
- **Add a feature UI piece**: add to `components/<feature>/`.
- **Add DB helpers/queries**: add functions to `server/db/connection.ts` (or introduce a new `server/db/<feature>.ts` module if it grows).

## Code Style & Conventions

- TypeScript is in **strict** mode (`tsconfig.json`). Prefer explicit, accurate types.
- ESLint is configured via `eslint.config.mjs`. Run `npm run lint` before opening a PR.
- Client Components must start with `"use client"` if they use state, effects, event handlers, or browser-only APIs.
- Prefer user-facing error text through `lib/publicErrors.ts` rather than hard-coding strings in many places.

