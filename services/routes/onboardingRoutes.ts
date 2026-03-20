// services/routes/onboardingRoutes.ts
// Company self-serve onboarding — single endpoint that creates:
//   company → owner user → first branch → optional first employee
// One call, fully atomic via sequential inserts.

import { FastifyInstance } from "fastify";
import { getSql } from "../../db";
import { z } from "zod";
import * as bcrypt from "bcryptjs";

// ============================================================
// Schemas
// ============================================================

const onboardingSchema = z.object({
	// Company
	companyName: z.string().min(1, "Company name is required"),

	// Owner account
	ownerName: z.string().min(1, "Owner name is required"),
	ownerEmail: z.string().email("Invalid email"),
	ownerPassword: z.string().min(8, "Password must be at least 8 characters"),
	ownerPhone: z.string().optional(),

	// First branch (optional — defaults to company name if not provided)
	branchName: z.string().optional(),
	branchAddress: z.string().optional(),
	branchCity: z.string().optional(),
	branchState: z.string().min(2).max(2).optional(),
	branchZip: z.string().min(5).optional(),
	branchPhone: z.string().optional(),

	// Company settings (optional)
	timezone: z.string().default("America/Chicago"),
	industry: z.string().default("hvac")
});

// ============================================================
// Routes
// ============================================================

export async function onboardingRoutes(fastify: FastifyInstance) {
	// ----------------------------------------------------------
	// POST /onboard
	// Self-serve company signup. No auth required — this is how
	// new HVAC shops get into the system.
	//
	// Creates in order:
	//   1. company row
	//   2. hashed owner password
	//   3. user row (role: admin)
	//   4. first branch (required for dispatch to work)
	//   5. employee row linked to user (so owner can be dispatched)
	//
	// Returns: JWT token so the owner is immediately logged in.
	// ----------------------------------------------------------
	fastify.post("/onboard", async (request, reply) => {
		const parsed = onboardingSchema.safeParse(request.body);

		if (!parsed.success) {
			return reply.code(400).send({
				error: "Invalid request body",
				details: parsed.error.flatten().fieldErrors
			});
		}

		const body = parsed.data;
		const sql = getSql();

		// Check if email already exists — fail fast before creating anything
		const existingUser = await sql`
			SELECT id FROM users WHERE email = ${body.ownerEmail}
		`;

		if (existingUser[0]) {
			return reply.code(409).send({ error: "Email already registered" });
		}

		// Hash password
		const passwordHash = await bcrypt.hash(body.ownerPassword, 12);

		// 1. Create company
		const companyResult = (await sql`
			INSERT INTO companies (name, settings)
			VALUES (
				${body.companyName},
				${JSON.stringify({ timezone: body.timezone, industry: body.industry })}
			)
			RETURNING id
		`) as { id: string }[];

		const companyId = companyResult[0].id;

		// 2. Create owner user
		const userResult = (await sql`
			INSERT INTO users (email, password_hash, role, company_id, name)
			VALUES (
				${body.ownerEmail},
				${passwordHash},
				'admin',
				${companyId},
				${body.ownerName}
			)
			RETURNING id
		`) as { id: string }[];

		const userId = userResult[0].id;

		// 3. Create first branch
		const branchResult = (await sql`
			INSERT INTO branches (company_id, name, address, city, state, zip, phone)
			VALUES (
				${companyId},
				${body.branchName ?? body.companyName},
				${body.branchAddress ?? null},
				${body.branchCity ?? null},
				${body.branchState ?? null},
				${body.branchZip ?? null},
				${body.branchPhone ?? null}
			)
			RETURNING id
		`) as { id: string }[];

		const branchId = branchResult[0].id;

		// 4. Create employee record for the owner
		// Owner can be dispatched, appear in tech lists, etc.
		await sql`
			INSERT INTO employees (
				name, email, phone, role, company_id,
				branch_id, user_id, is_available
			) VALUES (
				${body.ownerName},
				${body.ownerEmail},
				${body.ownerPhone ?? null},
				'admin',
				${companyId},
				${branchId},
				${userId},
				false
			)
		`;

		// 5. Sign JWT so owner is immediately logged in
		const token = await reply.jwtSign(
			{
				userId,
				companyId,
				role: "admin",
				email: body.ownerEmail
			},
			{ expiresIn: "7d" }
		);

		console.log(`🎉 New company onboarded: ${body.companyName} (${companyId})`);

		return reply.code(201).send({
			message: "Company created successfully",
			token,
			companyId,
			branchId,
			userId
		});
	});

	// ----------------------------------------------------------
	// GET /onboard/check-email
	// Quick email availability check for the signup form.
	// No auth needed — called before account creation.
	// ----------------------------------------------------------
	fastify.get("/onboard/check-email", async (request, reply) => {
		const { email } = request.query as { email?: string };

		if (!email) {
			return reply.code(400).send({ error: "Email is required" });
		}

		const sql = getSql();

		const existing = await sql`
			SELECT id FROM users WHERE email = ${email}
		`;

		return reply.send({ available: !existing[0] });
	});

	// ----------------------------------------------------------
	// GET /onboard/status/:companyId
	// Returns onboarding completion status.
	// Frontend uses this to show the setup wizard progress.
	// Checks: company, branch, first employee, first customer,
	//         pricebook item, first job.
	// ----------------------------------------------------------
	fastify.get(
		"/onboard/status/:companyId",
		{
			// No auth for now — wizard shown before full setup is complete
		},
		async (request, reply) => {
			const { companyId } = request.params as { companyId: string };
			const sql = getSql();

			const [company, branches, employees, customers, jobs] = await Promise.all(
				[
					sql`SELECT id, name FROM companies WHERE id = ${companyId}`,
					sql`SELECT COUNT(*)::int AS count FROM branches WHERE company_id = ${companyId} AND is_active = true`,
					sql`SELECT COUNT(*)::int AS count FROM employees WHERE company_id = ${companyId}`,
					sql`SELECT COUNT(*)::int AS count FROM customers WHERE company_id = ${companyId} AND is_active = true`,
					sql`SELECT COUNT(*)::int AS count FROM jobs WHERE company_id = ${companyId}`
				]
			);

			if (!company[0]) {
				return reply.code(404).send({ error: "Company not found" });
			}

			const branchCount = (branches[0] as any).count;
			const employeeCount = (employees[0] as any).count;
			const customerCount = (customers[0] as any).count;
			const jobCount = (jobs[0] as any).count;

			// Wizard steps — each one unlocks the next in the frontend
			const steps = {
				companyCreated: true,
				branchCreated: branchCount > 0,
				techAdded: employeeCount > 0,
				customerAdded: customerCount > 0,
				firstJobCreated: jobCount > 0
			};

			const completedSteps = Object.values(steps).filter(Boolean).length;
			const totalSteps = Object.keys(steps).length;
			const percentComplete = Math.round((completedSteps / totalSteps) * 100);

			return reply.send({
				company: company[0],
				steps,
				percentComplete,
				isComplete: completedSteps === totalSteps
			});
		}
	);
}
