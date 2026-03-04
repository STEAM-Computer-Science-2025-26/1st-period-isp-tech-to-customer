# Tech to Customer

An end-to-end HVAC field service management platform — built to replace the patchwork of spreadsheets, phone calls, and disconnected tools that most HVAC companies rely on today.

**Live:** [tech-to-customer-isp.vercel.app](https://tech-to-customer-isp.vercel.app)  
**Repo:** [github.com/Lunar-arch/tech-to-customer-isp](https://github.com/Lunar-arch/tech-to-customer-isp)

---

## What It Does

Tech to Customer is a multi-tenant SaaS platform for HVAC companies. It handles the full operational lifecycle — from the moment a customer calls in to the moment a tech closes the job and the invoice is paid.

**Dispatch & Job Management** — Jobs move through a structured workflow (`unassigned → assigned → in_progress → completed`). The dispatch engine automatically scores and ranks available technicians in real time, or flags for manual dispatch if no eligible tech is found.

**Smart Tech Matching** — A multi-stage dispatch algorithm filters techs by hard eligibility rules (availability, skills, certifications, workload capacity), then ranks them using a weighted scoring model across five factors: drive time, availability, skill match, performance rating, and current workload. Emergency jobs shift the weighting toward proximity with a tighter 20-minute drive threshold.

**Customer ETA Links** — Dispatchers generate short-lived, tokenized links customers can open without logging in to track their tech's ETA and location in real time.

**Forecasting & Analytics** — The platform generates demand forecasts (monthly and weekly granularity), seasonal trend analysis, staffing recommendations, and parts demand projections — all derived from historical job data.

**Maintenance Agreements & Recurring Jobs** — Companies sell service plans with configurable tiers (monthly/annual billing, included visits, priority dispatch, discount percentages). A cron-driven scheduler auto-generates jobs for active agreements on the right cadence.

**Financing** — Built-in consumer financing workflow: customers apply at checkout, admins approve or decline, and the system automatically generates an amortized payment schedule. Designed to be wire-compatible with Wisetack or Synchrony when ready.

**Full Back-Office** — Estimates, invoices, accounts payable, purchase orders, parts inventory, payroll runs, employee expenses, vendor management, and QuickBooks token integration.

**CRM & Communications** — Lead pipeline, email campaigns, SMS messaging, call logs, review request automation, and customer interaction history.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript |
| Frontend | React + Tailwind CSS |
| API Server | Fastify |
| Database | PostgreSQL on Neon Serverless |
| Validation | Zod |
| Auth | JWT middleware |
| Package Manager | pnpm |

---

## Project Structure

```
/
├── app/                          # Next.js App Router
│   ├── (auth)/login/             # /login
│   ├── dashboard/                # Dashboard pages
│   ├── api/                      # Next.js route handlers
│   │   ├── auth/login/
│   │   ├── jobs/
│   │   └── employees/
│   ├── layout.tsx
│   ├── page.tsx
│   └── globals.css
│
├── components/
│   ├── layout/                   # Sidebar, Header, MainContent
│   ├── ui/                       # Design system primitives
│   ├── dashboard/
│   ├── jobs/
│   ├── calendar/
│   ├── maps/
│   └── resources/                # Scorecard and other tools
│
├── services/                     # Fastify server + all business logic
│   ├── routes/                   # Route handlers (see API Reference)
│   ├── dispatch/
│   │   ├── scorer.ts             # Weighted tech scoring
│   │   └── routing.ts            # Batch drive time calculation
│   ├── middleware/
│   │   └── auth.ts               # JWT authentication
│   └── types/
│       └── errorTypes.ts
│
├── algo/                         # Dispatch algorithm (standalone)
│   ├── stage1-eligibility.ts     # Hard filter rules
│   ├── scoring.ts                # Weighted score calculation
│   ├── ranker.ts                 # Sorting + tie-breaking + recommendation
│   └── main-dispatch.ts          # Single-job and batch dispatch pipeline
│
├── types/                        # Shared TypeScript types
│   ├── userTypes.ts
│   ├── jobTypes.ts
│   ├── employeeTypes.ts
│   ├── companyTypes.ts
│   └── agreementTypes.ts
│
├── db/
│   ├── connection.ts             # Neon connection + query helpers
│   ├── schema.sql                # Full database schema
│   └── test-connection.ts
│
└── tests/
    └── unit/                     # Unit tests (Vitest)
```

---

## Database

107 tables across 12 functional domains.

| Domain | Tables |
|--------|--------|
| **Core Operations** | `jobs`, `job_assignments`, `job_completions`, `job_events`, `job_time_tracking`, `job_eta_tokens`, `job_reassignment_history`, `job_assignment_logs`, `recurring_job_schedules` |
| **Dispatch** | `employees`, `tech_locations`, `tech_certifications`, `tech_performance_snapshots`, `employee_schedule_constraints`, `employee_location_history`, `employee_transfer_log` |
| **Customers & CRM** | `customers`, `customer_locations`, `customer_equipment`, `customer_interactions`, `customer_portal_tokens`, `customer_no_shows`, `crm_leads`, `crm_lead_activities`, `booking_requests` |
| **Finance** | `invoices`, `invoice_line_items`, `estimates`, `estimate_line_items`, `payroll_runs`, `payroll_run_employees`, `financing_plans`, `financing_applications`, `financing_payments`, `ap_bills`, `ap_vendors`, `ap_bill_line_items` |
| **Inventory & Equipment** | `parts_inventory`, `parts_usage_log`, `truck_inventory`, `warehouse_inventory_log`, `equipment`, `equipment_service_history`, `equipment_replacement_triggers`, `vehicles` |
| **Purchasing** | `purchase_orders`, `po_line_items`, `po_receipts`, `po_receipt_lines`, `po_vendor_invoices`, `pricebook_items` |
| **Service Agreements** | `maintenance_agreements`, `maintenance_agreement_tiers` |
| **Communications** | `sms_messages`, `email_campaigns`, `email_templates`, `email_sends`, `call_logs`, `review_requests`, `customer_communications` |
| **Forecasting & ML** | `ml_predictions`, `seasonal_demand_forecast`, `weather_conditions`, `competitor_pricing_observations`, `kpi_thresholds`, `kpi_alerts` |
| **Company & Org** | `companies`, `company_regions`, `branches`, `company_settings`, `users`, `regions` |
| **Scheduling** | `schedule_auto_adjust_rules`, `schedule_adjustment_log`, `after_hours_rules`, `staffing_alert_rules`, `staffing_alert_history` |
| **Infrastructure** | `audit_logs`, `api_rate_limits`, `schema_migrations`, `snapshot_update_queue`, `system_performance_metrics`, `qb_tokens` |

---

## Dispatch Algorithm

The dispatch pipeline runs in three stages:

**Stage 1 — Eligibility Filter (Hard Rules)**  
Techs are eliminated if they fail any hard constraint: unavailable, at max concurrent job capacity, missing required skills or certifications, or outside a valid location.

**Stage 2 — Weighted Scoring**

Each eligible tech receives a score out of 100:

| Factor | Standard Weight | Emergency Weight |
|--------|----------------|-----------------|
| Drive time | 40 pts (≤ 45 min window) | 60 pts (≤ 20 min window) |
| Availability | 20 pts | 20 pts |
| Skill match | 20 pts (partial credit) | 20 pts |
| Performance rating | 10 pts | 10 pts |
| Current workload | 10 pts | 10 pts |

**Stage 3 — Ranking & Recommendation**  
Techs are sorted by score descending. Ties within a 0.1-point threshold fall back to a deterministic tiebreaker: lower distance → higher workload score → lexicographic ID. The top 3 candidates are surfaced for dispatcher visibility. If no eligible techs exist, the job is flagged for manual dispatch with a reason. Dispatchers can override the recommendation; overrides are logged with reason and the algorithm's original recommendation for future analysis.

**Batch Dispatch**  
For bulk job processing, the pipeline tracks a mutable capacity map so each subsequent job reflects the updated workload state of previously assigned techs in the same batch.

---

## API Reference

All routes require JWT authentication unless marked **public**.

### Auth
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/auth/login` | Authenticate, receive JWT |

### Jobs
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/jobs` | List jobs with filters |
| `POST` | `/api/jobs` | Create a job |
| `PATCH` | `/api/jobs/:id/assign` | Assign tech |
| `PATCH` | `/api/jobs/:id/status` | Update status |
| `POST` | `/jobs/:id/dispatch-override` | Log manual override of auto-dispatch |
| `GET` | `/jobs/:id/dispatch-override` | Get override log |
| `POST` | `/jobs/:id/reassign` | Reassign + log reason |
| `GET` | `/jobs/:id/reassignments` | Full reassignment history |
| `GET` | `/analytics/dispatch-overrides` | Company-level override report |

### Employees
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/employees` | List employees |
| `GET` | `/api/employees/:id` | Get employee |
| `POST` | `/api/employees` | Create employee |
| `PATCH` | `/api/employees/:id` | Update employee or location |
| `GET` | `/api/employees/available` | Available techs |
| `PATCH` | `/api/employees/:id/availability` | Toggle availability |

### Time Tracking
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/jobs/:id/time-tracking` | Drive, wrench, and on-site durations |
| `PATCH` | `/jobs/:id/time-tracking` | Update tracking checkpoints |

### ETA
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/eta/token` | Generate customer ETA link |
| `GET` | `/eta/:token` | **Public** — customer polls for ETA |
| `PATCH` | `/eta/update` | Tech updates ETA + location |

### Forecasting
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/forecast/jobs` | Demand forecast (monthly or weekly) |
| `GET` | `/forecast/seasonal-trends` | Year-over-year job volume by month |
| `GET` | `/forecast/staffing` | Recommended tech headcount per month |
| `GET` | `/forecast/parts-demand` | Parts usage projection |

### Financing
| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/financing/applications` | Submit financing application |
| `GET` | `/financing/applications` | List applications |
| `GET` | `/financing/applications/:id` | Application detail |
| `POST` | `/financing/applications/:id/approve` | Approve + generate payment plan |
| `POST` | `/financing/applications/:id/decline` | Decline with reason |
| `GET` | `/financing/plans` | List payment plans |
| `GET` | `/financing/plans/:id` | Plan detail + amortization schedule |
| `POST` | `/financing/plans/:id/record-payment` | Record payment received |
| `GET` | `/financing/overdue` | Overdue plans |
| `GET` | `/financing/calculator` | Monthly payment estimator |

### Regions
| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/regions` | List company regions |
| `POST` | `/regions` | Create region |
| `DELETE` | `/regions/:id` | Delete region |
| `POST` | `/regions/:id/branches` | Assign branch to region |
| `DELETE` | `/regions/:id/branches/:branchId` | Remove branch from region |
| `GET` | `/regions/:id/analytics` | Rolled-up stats across region |

---

## User Roles

| Role | Access |
|------|--------|
| **Company Owner** | Full access — company settings, billing, all branches |
| **Admin** | Branch management, employee oversight, job creation, analytics |
| **Employee** | Assigned jobs, status updates, time logging, location updates |
| **Dev** | Cross-company access for development and debugging |

---

## Getting Started

### Prerequisites

- Node.js v18+
- pnpm — [install](https://pnpm.io/installation)
- [Neon](https://neon.tech) PostgreSQL database

### Setup

```bash
git clone https://github.com/Lunar-arch/tech-to-customer-isp.git
cd tech-to-customer-isp
pnpm install
cp .env.example .env
# Add your DATABASE_URL to .env
```

### Database

Run `db/schema.sql` in your Neon SQL Editor, then verify:

```bash
pnpm exec tsx db/test-connection.ts
```

### Development

```bash
pnpm dev        # http://localhost:3000
pnpm lint       # ESLint + Prettier check
pnpm test       # Unit tests
pnpm build      # Production build
pnpm start      # Production server
```

### Environment Variables

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | Neon PostgreSQL connection string |

See `.env.example` for the full list.

---

## Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for codebase orientation and local setup details.

1. Branch off `main`
2. Make changes
3. `pnpm lint` — fix all errors before opening a PR
4. Submit PR with a clear description of what changed and why

---

## License

Computer Science II ISP Project — Nathan Barcroft, Tanay Shah, and Brendan Hancock.