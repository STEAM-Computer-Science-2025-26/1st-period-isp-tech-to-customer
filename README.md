# Tech to Customer – ISP Project

Tech to Customer is a HVAC management system that connects customers with HVAC suppliers and handles job assignment to employees. An all-in-one solution for managers, administration, and employees with statistics, charts, and multi-branch support. Basically, its a web service we're selling to air conditioning companies to help them manage jobs, their employees, statistics, and many other things.

## Overview

This project provides:

- Customer-to-technician job assignment
- Admin dashboard with analytics
- Employee management
- Real-time job tracking and status updates
- Role-based access control (Company Owner, Admin, Employee)
- Custom routing and ETA according to gas prices, mileage, and other factors

## Tech Stack

This is a [Next.js 16](https://nextjs.org) project that combines React for the frontend and Node.js for the backend in one codebase to allow everyone in our team to work together.

**Dependencies:**

- **Next.js** - Full-stack React framework
- **TypeScript** - Type-safe JavaScript
- **Tailwind CSS** - Utility-first styling
- **Neon Serverless** - PostgreSQL database
- **React** - UI library

## Project Structure

```
/
├── app/                         # Next.js App Router (all pages)
│   ├── (auth)/                  # Auth routes (grouped, not in URL)
│   │   └── login/page.tsx       # /login page
│   ├── dashboard/               # Dashboard pages
│   ├── api/                     # HTTP API routes (thin layer)
│   │   ├── auth/login/route.ts
│   │   ├── jobs/route.ts
│   │   └── employees/route.ts
│   ├── layout.tsx               # Root layout
│   ├── page.tsx                 # Home page
│   └── globals.css              # Global styles
│
├── components/                  # Shared UI components
│   ├── ui/                      # Small reusable components (buttons, inputs)
│   └── layout/                  # Layout components (nav, footer, sidebar)
│
├── types/                       # Shared TypeScript types (DTOs, API contracts)
│   ├── userTypes.ts
│   ├── jobTypes.ts
│   └── employeeTypes.ts
│
├── services/                    # Server-side helpers / business logic
│   └── publicErrors.ts          # User-friendly error messages
│
├── db/                          # Database logic
│   ├── connection.ts            # Neon DB connection + helpers
│   ├── schema.sql               # Database schema
│   └── test-connection.ts       # DB connection test script
│
├── .env.example                 # Example environment variables
├── next.config.ts               # Next.js configuration
├── tsconfig.json                # TypeScript configuration
└── tailwind.config.ts           # Tailwind CSS configuration
```

## Database Structure

```
companies
 ├── company_owners
 ├── admins
 ├── branches
 │    └── employees
 └── jobs
      ├── job_notes
      └── reviews

users
 ├── company_owners
 ├── admins
 └── employees
```

## Getting Started

### Prerequisites

- **Node.js** (v18 or later)
- **npm** (Node Package Manager)
- **PostgreSQL database** (we use [Neon](https://neon.tech))

### Installation

1. **Clone the repository:**

   ```bash
   git clone https://github.com/Lunar-arch/tech-to-customer-isp.git
   cd tech-to-customer-isp
   ```

2. **Install dependencies:**

   ```bash
   npm install
   ```

3. **Set up environment variables:**

   ```bash
   cp .env.example .env
   ```

   Then edit `.env` and add your database connection string:

   ```
   DATABASE_URL=your_neon_database_url_here
   ```

4. **Set up the database:**

   Run the schema in your Neon SQL Editor:

   ```bash
   # Copy the contents of server/db/schema.sql and run it in Neon
   ```

5. **Test the database connection:**
   ```bash
   npx tsx server/db/test-connection.ts
   ```

### Development

Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to see the app.

The app will auto-reload when you edit files.

### Build for Production (for actual official publishing)

```bash
npm run build
npm start
```

### Linting

```bash
npm run lint
```
This checks for errors, shows a custom message if no errors are found, and also runs a Prettier check to make sure your code is formatted 

## User Roles

- **Company Owner** - Full system access, manages admins and branches
- **Administration** - Branch management, employee oversight, analytics
- **Employee** - Job assignment, status updates, customer interaction

## Key Features

- Role-based auth
- Real-time job assignment
- Employee availability tracking
- Distance/price-based tech matching
- Job status workflow (unassigned → assigned → in_progress → completed)
- Multi-branch support (If companies have more than one location)
- TypeScript type safety across frontend/backend

## API Routes

All API routes are in `app/api/`:

- `POST /api/auth/login` - User authentication
- `GET /api/jobs` - List jobs (with filters)
- `POST /api/jobs` - Create new job
- `PATCH /api/jobs/[id]/assign` - Assign tech to job
- `PATCH /api/jobs/[id]/status` - Update job status
- `GET /api/employees` - List employees
- `GET /api/employees/available` - Get available techs
- `PATCH /api/employees/[id]/availability` - Toggle availability

## Contributing

1. Create a feature branch
2. Make your changes
3. Run `npm run lint` to check for errors
4. Submit a pull request

## Learn More

- [Next.js Documentation](https://nextjs.org/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Tailwind CSS Docs](https://tailwindcss.com/docs)
- [Neon Serverless Postgres](https://neon.tech/docs)

## License

Computer Science II ISP Project by Nathan Barcroft, Tanay Shah, and Brendan Hancock.
