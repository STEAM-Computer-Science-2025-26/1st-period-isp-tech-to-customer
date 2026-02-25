// tests/week1.test.ts
// Week 1 integration tests — hit the real server at localhost:3001
// Run with: pnpm test tests/week1.test.ts
//
// Covers:
//   - Health endpoints
//   - Auth (login, bad password, missing fields)
//   - Customers (CRUD + locations + equipment)
//   - Jobs (create, assign, status)
//   - Branches (CRUD)
//   - Onboarding status

import "dotenv/config";
import { get, post, patch, del, seedCompanyAndUser, deleteCompany } from "./helpers/api";

// ============================================================
// Test state shared across this file
// ============================================================

let token = "";
let companyId = "";
let userId = "";
let customerId = "";
let locationId = "";
let equipmentId = "";
let jobId = "";
let branchId = "";

const BASE = "http://localhost:3001";

// ============================================================
// Setup & teardown
// ============================================================

beforeAll(async () => {
	const seed = await seedCompanyAndUser("w1");
	token = seed.token;
	companyId = seed.companyId;
	userId = seed.userId;
});

afterAll(async () => {
	await deleteCompany(companyId);
});

// ============================================================
// 1. Health
// ============================================================

describe("Health", () => {
	test("GET /health returns ok", async () => {
		const res = await fetch(`${BASE}/health`);
		const body = await res.json() as any;
		expect(res.status).toBe(200);
		expect(body.status).toBe("ok");
	});

	test("GET /health/live returns alive", async () => {
		const res = await fetch(`${BASE}/health/live`);
		const body = await res.json() as any;
		expect(res.status).toBe(200);
		expect(body.status).toBe("alive");
	});

	test("GET /health/ready returns ready", async () => {
		const res = await fetch(`${BASE}/health/ready`);
		const body = await res.json() as any;
		expect([200, 503]).toContain(res.status);
		expect(body).toHaveProperty("checks");
		expect(body.checks.database).toBe("ok");
	});
});

// ============================================================
// 2. Auth
// ============================================================

describe("Auth", () => {
	test("POST /login with bad password returns 401", async () => {
		const { getSql } = await import("../db");
		const bcrypt = await import("bcryptjs");
		const sql = getSql();
		const email = `badlogin-${Date.now()}@test.local`;
		const hash = await bcrypt.hash("correct", 10);
		await sql`INSERT INTO users (email, password_hash, role, company_id) VALUES (${email}, ${hash}, 'admin', ${companyId})`;

		const res = await fetch(`${BASE}/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email, password: "wrong" })
		});
		expect(res.status).toBe(401);
		await sql`DELETE FROM users WHERE email = ${email}`;
	});

	test("POST /login with missing fields returns 400", async () => {
		const res = await fetch(`${BASE}/login`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ email: "nopassword@test.local" })
		});
		expect(res.status).toBe(400);
	});

	test("GET /jobs without token returns 401", async () => {
		const res = await fetch(`${BASE}/jobs`);
		expect(res.status).toBe(401);
	});
});

// ============================================================
// 3. Customers
// ============================================================

describe("Customers", () => {
	test("POST /customers creates a customer", async () => {
		const { status, body } = await post("/customers", token, {
			firstName: "Jane",
			lastName: "Doe",
			email: `jane-${Date.now()}@example.com`,
			phone: "214-555-0001",
			customerType: "residential",
			address: "123 Main St",
			city: "Dallas",
			state: "TX",
			zip: "75201"
		});
		expect(status).toBe(201);
		expect(body.customer).toHaveProperty("id");
		customerId = body.customer.id;
	});

	test("GET /customers returns list including new customer", async () => {
		const { status, body } = await get("/customers", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.customers)).toBe(true);
		const found = body.customers.find((c: any) => c.id === customerId);
		expect(found).toBeDefined();
	});

	test("GET /customers/:id returns the customer", async () => {
		const { status, body } = await get(`/customers/${customerId}`, token);
		expect(status).toBe(200);
		expect(body.customer.id).toBe(customerId);
		expect(body.customer.firstName).toBe("Jane");
	});

	test("PATCH /customers/:id updates fields", async () => {
		const { status, body } = await patch(`/customers/${customerId}`, token, {
			phone: "214-555-9999",
			notes: "Updated via test"
		});
		expect(status).toBe(200);
		expect(body.customerId).toBe(customerId);
	});

	test("POST /customers with missing required fields returns 400", async () => {
		const { status } = await post("/customers", token, {
			firstName: "NoLast"
			// missing lastName, phone, etc.
		});
		expect(status).toBe(400);
	});

	test("GET /customers/:id with bad ID returns 404", async () => {
		const { status } = await get("/customers/00000000-0000-0000-0000-000000000000", token);
		expect(status).toBe(404);
	});

	// Locations
	test("POST /customers/:id/locations adds a location", async () => {
		const { status, body } = await post(`/customers/${customerId}/locations`, token, {
			address: "456 Oak Ave",
			city: "Dallas",
			state: "TX",
			zip: "75202",
			locationType: "service",
			isPrimary: true
		});
		expect(status).toBe(201);
		expect(body.location).toHaveProperty("id");
		locationId = body.location.id;
	});

	test("GET /customers/:id/locations returns locations", async () => {
		const { status, body } = await get(`/customers/${customerId}/locations`, token);
		expect(status).toBe(200);
		expect(Array.isArray(body.locations)).toBe(true);
		expect(body.locations.some((l: any) => l.id === locationId)).toBe(true);
	});

	test("PATCH /customers/:id/locations/:locId updates location", async () => {
		const { status } = await patch(
			`/customers/${customerId}/locations/${locationId}`,
			token,
			{ city: "Plano" }
		);
		expect(status).toBe(200);
	});

	// Equipment
	test("POST /customers/:id/equipment adds equipment", async () => {
		const { status, body } = await post(`/customers/${customerId}/equipment`, token, {
			equipmentType: "hvac_unit",
			brand: "Carrier",
			model: "24ACC636A003",
			serialNumber: "SN-TEST-001",
			installDate: "2022-01-15"
		});
		expect(status).toBe(201);
		expect(body.equipment).toHaveProperty("id");
		equipmentId = body.equipment.id;
	});

	test("GET /customers/:id/equipment returns equipment", async () => {
		const { status, body } = await get(`/customers/${customerId}/equipment`, token);
		expect(status).toBe(200);
		expect(body.equipment.some((e: any) => e.id === equipmentId)).toBe(true);
	});

	// Communications
	test("POST /customers/:id/communications logs a note", async () => {
		const { status } = await post(`/customers/${customerId}/communications`, token, {
			type: "phone",
			direction: "inbound",
			subject: "Customer called about AC",
			notes: "Scheduled service visit"
		});
		expect(status).toBe(201);
	});

	test("GET /customers/:id/communications returns logs", async () => {
		const { status, body } = await get(`/customers/${customerId}/communications`, token);
		expect(status).toBe(200);
		expect(Array.isArray(body.communications)).toBe(true);
	});

	// Soft delete
	test("DELETE /customers/:id soft-deletes the customer", async () => {
		// Create a throwaway customer to delete
		const { body: created } = await post("/customers", token, {
			firstName: "Del",
			lastName: "Me",
			email: `del-${Date.now()}@example.com`,
			phone: "214-000-0000",
			customerType: "residential",
			address: "1 Delete St",
			city: "Dallas",
			state: "TX",
			zip: "75201"
		});
		const delId = created.customer.id;
		const { status } = await del(`/customers/${delId}`, token);
		expect(status).toBe(200);
	});
});

// ============================================================
// 4. Branches
// ============================================================

describe("Branches", () => {
	test("POST /branches creates a branch", async () => {
		const { status, body } = await post("/branches", token, {
			name: "North Dallas Branch",
			address: "100 N Central Expy",
			city: "Dallas",
			state: "TX",
			zip: "75243",
			phone: "214-555-1000"
		});
		expect(status).toBe(201);
		expect(body.branch).toHaveProperty("id");
		branchId = body.branch.id;
	});

	test("GET /branches returns branches", async () => {
		const { status, body } = await get("/branches", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.branches)).toBe(true);
		expect(body.branches.some((b: any) => b.id === branchId)).toBe(true);
	});

	test("GET /branches/:id returns branch", async () => {
		const { status, body } = await get(`/branches/${branchId}`, token);
		expect(status).toBe(200);
		expect(body.branch.id).toBe(branchId);
	});

	test("PATCH /branches/:id updates branch", async () => {
		const { status } = await patch(`/branches/${branchId}`, token, {
			name: "North Dallas Branch (Updated)"
		});
		expect(status).toBe(200);
	});

	test("DELETE /branches/:id soft-deletes branch", async () => {
		const { status } = await del(`/branches/${branchId}`, token);
		expect(status).toBe(200);
	});
});

// ============================================================
// 5. Jobs
// ============================================================

describe("Jobs", () => {
	test("POST /jobs creates a job", async () => {
		const { status, body } = await post("/jobs", token, {
			customerName: "Jane Doe",
			jobType: "repair",
			priority: "normal",
			address: "123 Main St, Dallas, TX 75201",
			phone: "214-555-0001",
			initialNotes: "AC not cooling",
			scheduledTime: new Date(Date.now() + 86400000).toISOString()
		});
		expect(status).toBe(201);
		expect(body.job).toHaveProperty("id");
		jobId = body.job.id;
	});

	test("GET /jobs returns list with new job", async () => {
		const { status, body } = await get("/jobs", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.jobs)).toBe(true);
		expect(body.jobs.some((j: any) => j.id === jobId)).toBe(true);
	});

	test("GET /jobs/:id returns the job", async () => {
		const { status, body } = await get(`/jobs/${jobId}`, token);
		expect(status).toBe(200);
		expect(body.job.id).toBe(jobId);
	});

	test("POST /jobs with missing required fields returns 400", async () => {
		const { status } = await post("/jobs", token, { initialNotes: "no required fields" });
		expect(status).toBe(400);
	});
});

// ============================================================
// 6. Onboarding status
// ============================================================

describe("Onboarding", () => {
	test("GET /onboard/status/:companyId returns status", async () => {
		const { status, body } = await get(`/onboard/status/${companyId}`, token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("steps");
		expect(body.steps.companyCreated).toBe(true);
		expect(typeof body.percentComplete).toBe("number");
	});

	test("GET /onboard/status with bad companyId returns 404", async () => {
		const { status } = await get("/onboard/status/00000000-0000-0000-0000-000000000000", token);
		expect(status).toBe(404);
	});
});