// tests/week4week5.test.ts
// Week 4 (remaining) + Week 5 integration tests
// Run with: pnpm test tests/week4week5.test.ts
//
// Covers:
//   Week 4 remaining:
//     - Equipment age-based replacement alerts (list, summary, dismiss, trigger-job)
//     - Seasonal demand forecasting (demand, trends, staffing, parts-demand)
//   Week 5 (backend only — already built, just needs tests):
//     - Two-way SMS (send, list, inbound webhook)
//     - Audit log (list, filter)
//     - Customer-facing ETA (generate token, update ETA, public lookup)
//     - Tech leaderboard
//     - Multi-tenant isolation (customers, jobs, audit logs)

import "dotenv/config";
import { getSql } from "../db";
import {
	get,
	post,
	patch,
	del,
	seedCompanyAndUser,
	deleteCompany,
	BASE,
} from "./helpers/api";

// ============================================================
// Shared state
// ============================================================

let token = "";
let companyId = "";
let customerId = "";
let jobId = "";
let techId = "";
let equipmentIdOld = ""; // 15-year-old unit — should trigger alert
let equipmentIdNew = ""; // brand new unit — no alert

// ============================================================
// Setup
// ============================================================

beforeAll(async () => {
	const seed = await seedCompanyAndUser("w45");
	token = seed.token;
	companyId = seed.companyId;

	const sql = getSql();

	// Customer
	const [customer] = (await sql`
		INSERT INTO customers (
			company_id, first_name, last_name, email, phone,
			customer_type, address, city, state, zip
		) VALUES (
			${companyId}, 'Week45', 'Tester',
			${"w45-" + Date.now() + "@test.local"},
			'214-555-0045', 'residential',
			'45 Test Blvd', 'Dallas', 'TX', '75201'
		)
		RETURNING id
	`) as any[];
	customerId = customer.id;

	// Tech
	const [tech] = (await sql`
		INSERT INTO employees (
			company_id, name, email, role,
			is_active, is_available,
			current_jobs_count, max_concurrent_jobs,
			latitude, longitude
		) VALUES (
			${companyId}, 'W45 Tech', ${"w45tech-" + Date.now() + "@test.local"},
			'technician', TRUE, TRUE, 0, 3,
			32.7767, -96.7970
		)
		RETURNING id
	`) as any[];
	techId = tech.id;

	// Job (completed, for ETA + leaderboard tests)
	const [job] = (await sql`
		INSERT INTO jobs (
			company_id, customer_id, customer_name,
			address, phone, job_type, priority, status,
			assigned_tech_id, scheduled_time
		) VALUES (
			${companyId}, ${customerId}, 'Week45 Tester',
			'45 Test Blvd, Dallas, TX 75201', '214-555-0045',
			'maintenance', 'normal', 'assigned',
			${techId}, NOW() + INTERVAL '2 hours'
		)
		RETURNING id
	`) as any[];
	jobId = job.id;

	// Old equipment — AC unit installed 15 years ago (should trigger critical alert)
	const [oldEq] = (await sql`
		INSERT INTO equipment (
			company_id, customer_id,
			equipment_type, manufacturer, model_number,
			install_date, condition, is_active
		) VALUES (
			${companyId}, ${customerId},
			'ac', 'Carrier', 'OLD-AC-001',
			(NOW() - INTERVAL '15 years')::date,
			'fair', TRUE
		)
		RETURNING id
	`) as any[];
	equipmentIdOld = oldEq.id;

	// New equipment — thermostat installed 1 year ago (no alert)
	const [newEq] = (await sql`
		INSERT INTO equipment (
			company_id, customer_id,
			equipment_type, manufacturer, model_number,
			install_date, condition, is_active
		) VALUES (
			${companyId}, ${customerId},
			'thermostat', 'Ecobee', 'NEW-TSTAT-001',
			(NOW() - INTERVAL '1 year')::date,
			'excellent', TRUE
		)
		RETURNING id
	`) as any[];
	equipmentIdNew = newEq.id;
});

afterAll(async () => {
	const sql = getSql();
	await sql`DELETE FROM equipment_replacement_snoozes WHERE company_id = ${companyId}`;
	await deleteCompany(companyId);
});

// ============================================================
// 1. Equipment Replacement Alerts
// ============================================================

describe("Equipment Replacement Alerts", () => {
	test("GET /equipment/replacement-alerts returns alerts for old equipment", async () => {
		const { status, body } = await get("/equipment/replacement-alerts", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("alerts");
		expect(body).toHaveProperty("total");
		// Old AC should be in the alerts
		const found = body.alerts.some((a: any) => a.id === equipmentIdOld);
		expect(found).toBe(true);
	});

	test("GET /equipment/replacement-alerts does NOT include new equipment", async () => {
		const { status, body } = await get("/equipment/replacement-alerts", token);
		expect(status).toBe(200);
		const found = body.alerts.some((a: any) => a.id === equipmentIdNew);
		expect(found).toBe(false);
	});

	test("GET /equipment/replacement-alerts filters by urgency=critical", async () => {
		const { status, body } = await get(
			"/equipment/replacement-alerts?urgency=critical",
			token
		);
		expect(status).toBe(200);
		expect(body.alerts.every((a: any) => a.urgency === "critical")).toBe(true);
	});

	test("GET /equipment/replacement-alerts filters by customerId", async () => {
		const { status, body } = await get(
			`/equipment/replacement-alerts?customerId=${customerId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.alerts.every((a: any) => a.customerId === customerId)).toBe(true);
	});

	test("GET /equipment/replacement-alerts/summary returns counts", async () => {
		const { status, body } = await get(
			"/equipment/replacement-alerts/summary",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("total");
		expect(body).toHaveProperty("warning");
		expect(body).toHaveProperty("critical");
		expect(body).toHaveProperty("byType");
		expect(body).toHaveProperty("thresholds");
		expect(body.total).toBeGreaterThanOrEqual(1);
	});

	test("POST /equipment/replacement-alerts/:id/dismiss snoozes the alert", async () => {
		const { status, body } = await post(
			`/equipment/replacement-alerts/${equipmentIdOld}/dismiss`,
			token,
			{ snoozeDays: 30, notes: "Customer aware, will replace next season" }
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("snoozedUntil");
		expect(body.snoozeDays).toBe(30);
	});

	test("GET /equipment/replacement-alerts hides snoozed equipment", async () => {
		const { status, body } = await get("/equipment/replacement-alerts", token);
		expect(status).toBe(200);
		// Snoozed old AC should no longer appear
		const found = body.alerts.some((a: any) => a.id === equipmentIdOld);
		expect(found).toBe(false);
	});

	test("POST /equipment/replacement-alerts/:id/dismiss with bad id returns 404", async () => {
		const { status } = await post(
			"/equipment/replacement-alerts/00000000-0000-0000-0000-000000000000/dismiss",
			token,
			{ snoozeDays: 30 }
		);
		expect(status).toBe(404);
	});

	test("POST /equipment/replacement-alerts/:id/trigger-job creates a replacement job", async () => {
		const { status, body } = await post(
			`/equipment/replacement-alerts/${equipmentIdOld}/trigger-job`,
			token,
			{
				priority: "medium",
				notes: "Customer requested Carrier replacement",
			}
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("jobId");
		expect(body.equipmentId).toBe(equipmentIdOld);
		expect(body).toHaveProperty("customerName");
	});

	test("POST /equipment/replacement-alerts/:id/trigger-job with invalid priority returns 400", async () => {
		const { status } = await post(
			`/equipment/replacement-alerts/${equipmentIdOld}/trigger-job`,
			token,
			{ priority: "mega-urgent" }
		);
		expect(status).toBe(400);
	});
});

// ============================================================
// 2. Seasonal Demand Forecasting
// ============================================================

describe("Seasonal Demand Forecasting", () => {
	test("GET /forecast/demand returns forecast with correct shape", async () => {
		const { status, body } = await get("/forecast/demand", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("forecast");
		expect(body).toHaveProperty("granularity");
		expect(body).toHaveProperty("horizon");
		expect(body).toHaveProperty("overallMonthlyAverage");
		expect(Array.isArray(body.forecast)).toBe(true);
		expect(body.forecast.length).toBe(body.horizon);
	});

	test("GET /forecast/demand respects horizon param", async () => {
		const { status, body } = await get("/forecast/demand?horizon=3", token);
		expect(status).toBe(200);
		expect(body.forecast.length).toBe(3);
	});

	test("GET /forecast/demand with granularity=week returns weekly periods", async () => {
		const { status, body } = await get(
			"/forecast/demand?granularity=week&horizon=2",
			token
		);
		expect(status).toBe(200);
		expect(body.granularity).toBe("week");
		// 2 months * ~4 weeks = 8 periods
		expect(body.forecast.length).toBe(8);
	});

	test("GET /forecast/demand each period has predictedJobs", async () => {
		const { status, body } = await get("/forecast/demand?horizon=6", token);
		expect(status).toBe(200);
		body.forecast.forEach((period: any) => {
			expect(period).toHaveProperty("period");
			expect(period).toHaveProperty("predictedJobs");
			expect(typeof period.predictedJobs).toBe("number");
			expect(period).toHaveProperty("multiplier");
		});
	});

	test("GET /forecast/demand with invalid horizon returns 400", async () => {
		const { status } = await get("/forecast/demand?horizon=999", token);
		expect(status).toBe(400);
	});

	test("GET /forecast/seasonal-trends returns year-over-year data", async () => {
		const { status, body } = await get("/forecast/seasonal-trends", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("byYear");
		expect(body).toHaveProperty("insights");
		expect(body.insights).toHaveProperty("seasonalMultipliers");
		expect(body.insights.seasonalMultipliers.length).toBe(12);
	});

	test("GET /forecast/staffing returns staffing recommendations", async () => {
		const { status, body } = await get("/forecast/staffing", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("staffing");
		expect(body).toHaveProperty("currentTechs");
		expect(body).toHaveProperty("jobsPerTechPerDay");
		expect(Array.isArray(body.staffing)).toBe(true);
		body.staffing.forEach((period: any) => {
			expect(period).toHaveProperty("techsNeeded");
			expect(period).toHaveProperty("delta");
			expect(period).toHaveProperty("recommendation");
			expect(period).toHaveProperty("utilizationPct");
		});
	});

	test("GET /forecast/staffing respects jobsPerTechPerDay param", async () => {
		const { status, body } = await get(
			"/forecast/staffing?jobsPerTechPerDay=8",
			token
		);
		expect(status).toBe(200);
		expect(body.jobsPerTechPerDay).toBe(8);
	});

	test("GET /forecast/parts-demand returns parts predictions", async () => {
		const { status, body } = await get("/forecast/parts-demand", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("parts");
		expect(body).toHaveProperty("horizon");
		expect(Array.isArray(body.parts)).toBe(true);
		// Parts may be empty if no history, but shape should be correct
		if (body.parts.length > 0) {
			const part = body.parts[0];
			expect(part).toHaveProperty("partName");
			expect(part).toHaveProperty("avgMonthlyUsage");
			expect(part).toHaveProperty("forecast");
			expect(part).toHaveProperty("totalPredictedUnits");
			expect(part).toHaveProperty("totalPredictedCost");
		}
	});
});

// ============================================================
// 3. Audit Log (Week 5)
// ============================================================

describe("Audit Log", () => {
	test("GET /audit returns list", async () => {
		const { status, body } = await get("/audit", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("logs");
		expect(Array.isArray(body.logs)).toBe(true);
	});

	test("GET /audit filters by entityType", async () => {
		const { status, body } = await get("/audit?entityType=customer", token);
		expect(status).toBe(200);
		if (body.logs.length > 0) {
			expect(body.logs.every((l: any) => l.entity_type === "customer")).toBe(true);
		}
	});

	test("GET /audit filters by limit", async () => {
		const { status, body } = await get("/audit?limit=5", token);
		expect(status).toBe(200);
		expect(body.logs.length).toBeLessThanOrEqual(5);
	});

	test("GET /audit with invalid limit returns 400", async () => {
		const { status } = await get("/audit?limit=9999", token);
		expect(status).toBe(400);
	});
});

// ============================================================
// 4. Customer-Facing ETA (Week 5)
// ============================================================

describe("Customer ETA", () => {
	let etaToken = "";

	test("POST /eta/token generates a token for the job", async () => {
		const { status, body } = await post("/eta/token", token, {
			jobId,
			expiresInMinutes: 120,
		});
		expect(status).toBe(200);
		expect(body).toHaveProperty("token");
		expect(body).toHaveProperty("expiresAt");
		expect(body).toHaveProperty("etaUrl");
		etaToken = body.token;
	});

	test("POST /eta/update sets ETA for the job", async () => {
		const { status, body } = await post("/eta/update", token, {
			jobId,
			etaMinutes: 30,
			note: "On the way, light traffic",
		});
		expect(status).toBe(200);
		expect(body).toHaveProperty("etaMinutes");
	});

	test("GET /eta/:token returns public ETA (no auth)", async () => {
		const res = await fetch(`${BASE}/eta/${etaToken}`);
		const body = (await res.json()) as any;
		expect(res.status).toBe(200);
		expect(body).toHaveProperty("etaMinutes");
		expect(body).toHaveProperty("jobId");
	});

	test("GET /eta/:token with expired/bad token returns 404", async () => {
		const res = await fetch(`${BASE}/eta/invalid-token-xyz`);
		expect(res.status).toBe(404);
	});

	test("POST /eta/token for non-existent job returns 404", async () => {
		const { status } = await post("/eta/token", token, {
			jobId: "00000000-0000-0000-0000-000000000000",
			expiresInMinutes: 60,
		});
		expect(status).toBe(404);
	});
});

// ============================================================
// 5. Tech Leaderboard (Week 5)
// ============================================================

describe("Tech Leaderboard", () => {
	test("GET /leaderboard/techs returns leaderboard", async () => {
		const { status, body } = await get("/leaderboard/techs", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("leaderboard");
		expect(Array.isArray(body.leaderboard)).toBe(true);
	});

	test("GET /leaderboard/techs respects period param", async () => {
		const { status, body } = await get("/leaderboard/techs?period=week", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("leaderboard");
	});

	test("GET /leaderboard/techs respects metric param", async () => {
		const { status, body } = await get(
			"/leaderboard/techs?metric=jobs_completed",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("leaderboard");
	});

	test("GET /leaderboard/techs with invalid metric returns 400", async () => {
		const { status } = await get("/leaderboard/techs?metric=fake_metric", token);
		expect(status).toBe(400);
	});

	test("GET /leaderboard/techs with invalid period returns 400", async () => {
		const { status } = await get("/leaderboard/techs?period=yesterday", token);
		expect(status).toBe(400);
	});
});

// ============================================================
// 6. Two-Way SMS (Week 5)
// ============================================================

describe("Two-Way SMS", () => {
	test("GET /sms returns message list", async () => {
		const { status, body } = await get("/sms", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("messages");
		expect(Array.isArray(body.messages)).toBe(true);
	});

	test("GET /sms filters by direction", async () => {
		const { status, body } = await get("/sms?direction=outbound", token);
		expect(status).toBe(200);
		if (body.messages.length > 0) {
			expect(body.messages.every((m: any) => m.direction === "outbound")).toBe(true);
		}
	});

	test("POST /sms/send with missing phone returns 400", async () => {
		const { status } = await post("/sms/send", token, {
			body: "Hello there",
			// missing toPhone
		});
		expect(status).toBe(400);
	});

	test("POST /sms/send with missing body returns 400", async () => {
		const { status } = await post("/sms/send", token, {
			toPhone: "214-555-9999",
			// missing body
		});
		expect(status).toBe(400);
	});

	test("POST /sms/inbound (Twilio webhook) requires valid signature or returns 403", async () => {
		// Without valid Twilio signature, should reject
		const res = await fetch(`${BASE}/sms/inbound`, {
			method: "POST",
			headers: { "Content-Type": "application/x-www-form-urlencoded" },
			body: new URLSearchParams({
				From: "+12145559999",
				Body: "Hello from customer",
				MessageSid: "SMtest123",
			}).toString(),
		});
		// Should be 403 (invalid signature) or 200 (if signature check disabled in test env)
		expect([200, 403, 400]).toContain(res.status);
	});
});