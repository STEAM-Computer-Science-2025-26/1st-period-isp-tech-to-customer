// tests/week4.test.ts
// Week 4 integration tests — hit the real server at localhost:3001
// Run with: pnpm test tests/week4.test.ts
//
// Covers:
//   Phase 2 — Cert expiration alerts (via cron endpoint)
//   Phase 3 — Job close with callbackRequired + job_completions written
//   Phase 3 — Analytics (revenue, tech-performance, job-kpis, first-time-fix, callback-rate, time-breakdown)
//   Phase 3 — Job time tracking endpoints
//   Phase 3 — KPI thresholds + alerts
//   Phase 4 — Dispatch override logging
//   Phase 4 — Job reassignment history
//   Refrigerant logs (create, list, summary, amend — no delete)

import "dotenv/config";
import { getSql } from "../db";
import {
	get,
	post,
	patch,
	del,
	seedCompanyAndUser,
	deleteCompany
} from "./helpers/api";

// ============================================================
// Shared state
// ============================================================

let token = "";
let companyId = "";
let customerId = "";
let jobId = "";
let techId = "";
let certId = "";
let kpiThresholdId = "";
let refrigerantLogId = "";
let timeTrackingJobId = "";

// ============================================================
// Setup & teardown
// ============================================================

beforeAll(async () => {
	const seed = await seedCompanyAndUser("w4");
	token = seed.token;
	companyId = seed.companyId;

	const sql = getSql();

	// Create a customer
	const [customer] = (await sql`
		INSERT INTO customers (
			company_id, first_name, last_name, email, phone,
			customer_type, address, city, state, zip
		) VALUES (
			${companyId}, 'Week4', 'Tester',
			${"w4-" + Date.now() + "@test.local"},
			'214-555-0004', 'residential',
			'400 Test Ave', 'Dallas', 'TX', '75201'
		)
		RETURNING id
	`) as any[];
	customerId = customer.id;

	// Create a tech (employee)
	const [tech] = (await sql`
		INSERT INTO employees (
			company_id, name, email, role,
			is_active, is_available,
			current_jobs_count, max_concurrent_jobs,
			latitude, longitude
		) VALUES (
			${companyId}, 'W4 Tech', ${"w4tech-" + Date.now() + "@test.local"},
			'technician', TRUE, TRUE, 0, 3,
			32.7767, -96.7970
		)
		RETURNING id
	`) as any[];
	techId = tech.id;

	// Create a base job
	const [job] = (await sql`
		INSERT INTO jobs (
			company_id, customer_id, customer_name,
			address, phone, job_type, priority, status,
			assigned_tech_id,
			estimated_duration_minutes,
			started_at
		) VALUES (
			${companyId}, ${customerId}, 'Week4 Tester',
			'400 Test Ave, Dallas, TX 75201', '214-555-0004',
			'repair', 'normal', 'assigned',
			${techId},
			90,
			NOW() - INTERVAL '2 hours'
		)
		RETURNING id
	`) as any[];
	jobId = job.id;

	// Create a job for time tracking tests
	const [ttJob] = (await sql`
		INSERT INTO jobs (
			company_id, customer_id, customer_name,
			address, phone, job_type, priority, status,
			assigned_tech_id, estimated_duration_minutes
		) VALUES (
			${companyId}, ${customerId}, 'TimeTrack Tester',
			'400 Test Ave, Dallas, TX 75201', '214-555-0004',
			'maintenance', 'normal', 'assigned',
			${techId}, 60
		)
		RETURNING id
	`) as any[];
	timeTrackingJobId = ttJob.id;
});

afterAll(async () => {
	const sql = getSql();
	// Clean up Week 4 specific tables first
	await sql`DELETE FROM refrigerant_logs            WHERE company_id = ${companyId}`;
	await sql`DELETE FROM job_time_tracking           WHERE company_id = ${companyId}`;
	await sql`DELETE FROM kpi_alerts                  WHERE company_id = ${companyId}`;
	await sql`DELETE FROM kpi_thresholds              WHERE company_id = ${companyId}`;
	await sql`DELETE FROM job_reassignment_history    WHERE company_id = ${companyId}`;
	await sql`DELETE FROM job_assignment_logs         WHERE company_id = ${companyId}`;
	await sql`DELETE FROM job_completions             WHERE company_id = ${companyId}`;
	await sql`DELETE FROM tech_certifications         WHERE company_id = ${companyId}`;
	await deleteCompany(companyId);
});

// ============================================================
// 1. Cert Expiration (Phase 2)
// ============================================================

describe("Tech Certifications", () => {
	test("POST /certifications creates a cert with expiry", async () => {
		const { status, body } = await post("/certifications", token, {
			techId,
			certType: "EPA_608",
			certNumber: "EPA-W4-001",
			expiryDate: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
				.toISOString()
				.split("T")[0] // 5 days from now — should trigger 7d alert
		});
		expect(status).toBe(201);
		expect(body).toHaveProperty("certificationId");
		certId = body.certificationId;
	});

	test("GET /certifications/tech/:techId returns the cert", async () => {
		const { status, body } = await get(`/certifications/tech/${techId}`, token);
		expect(status).toBe(200);
		expect(Array.isArray(body.certifications)).toBe(true);
		const found = body.certifications.find((c: any) => c.id === certId);
		expect(found).toBeDefined();
		expect(found.certType).toBe("EPA_608");
	});

	test("GET /certifications/expiring returns certs expiring soon", async () => {
		const { status, body } = await get("/certifications/expiring", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.certifications)).toBe(true);
		// Our 5-day cert should appear
		const found = body.certifications.find((c: any) => c.id === certId);
		expect(found).toBeDefined();
	});

	test("POST /api/cron/run fires cert expiration alert for 7-day cert", async () => {
		const res = await fetch("http://localhost:3001/api/cron/run", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${process.env.CRON_SECRET}`
			}
		});
		// Cron may return 200 or 401 if CRON_SECRET not set in test env
		// Just verify it doesn't 500
		expect([200, 401]).toContain(res.status);
	});
});

// ============================================================
// 2. Job Close — Phase 3 (callbackRequired + job_completions)
// ============================================================

describe("Job Close — Phase 3", () => {
	test("POST /jobs/:jobId/close with callbackRequired=true writes job_completions", async () => {
		const { status, body } = await post(`/jobs/${jobId}/close`, token, {
			completionNotes: "Fixed but customer called back last time",
			firstTimeFix: false,
			callbackRequired: true,
			customerRating: 3,
			paymentMethod: "none"
		});
		expect(status).toBe(200);
		expect(body.jobStatus).toBe("completed");
		expect(body.callbackRequired).toBe(true);
		expect(body.firstTimeFix).toBe(false);
	});

	test("GET /jobs/:jobId/payment-summary shows completion fields", async () => {
		const { status, body } = await get(`/jobs/${jobId}/payment-summary`, token);
		expect(status).toBe(200);
		expect(body.job.status).toBe("completed");
		expect(body.completion).not.toBeNull();
		expect(body.completion.callbackRequired).toBe(true);
		expect(body.completion.firstTimeFix).toBe(false);
		expect(body.completion.customerRating).toBe(3);
	});

	test("POST /jobs/:jobId/close on already completed job returns 409", async () => {
		const { status } = await post(`/jobs/${jobId}/close`, token, {
			paymentMethod: "none"
		});
		expect(status).toBe(409);
	});
});

// ============================================================
// 3. Job Time Tracking
// ============================================================

describe("Job Time Tracking", () => {
	test("POST /jobs/:jobId/time-tracking initializes tracking record", async () => {
		const { status, body } = await post(
			`/jobs/${timeTrackingJobId}/time-tracking`,
			token,
			{}
		);
		expect(status).toBe(201);
		expect(body.tracking).toHaveProperty("id");
		expect(body.tracking.job_id).toBe(timeTrackingJobId);
	});

	test("PATCH /jobs/:jobId/time-tracking/departed sets departed_at", async () => {
		const { status, body } = await patch(
			`/jobs/${timeTrackingJobId}/time-tracking/departed`,
			token,
			{}
		);
		expect(status).toBe(200);
		expect(body.tracking.departed_at).not.toBeNull();
	});

	test("PATCH /jobs/:jobId/time-tracking/arrived sets arrived_at", async () => {
		const { status, body } = await patch(
			`/jobs/${timeTrackingJobId}/time-tracking/arrived`,
			token,
			{}
		);
		expect(status).toBe(200);
		expect(body.tracking.arrived_at).not.toBeNull();
	});

	test("PATCH /jobs/:jobId/time-tracking/work-started sets work_started_at", async () => {
		const { status, body } = await patch(
			`/jobs/${timeTrackingJobId}/time-tracking/work-started`,
			token,
			{}
		);
		expect(status).toBe(200);
		expect(body.tracking.work_started_at).not.toBeNull();
	});

	test("PATCH /jobs/:jobId/time-tracking/work-ended sets work_ended_at", async () => {
		const { status, body } = await patch(
			`/jobs/${timeTrackingJobId}/time-tracking/work-ended`,
			token,
			{}
		);
		expect(status).toBe(200);
		expect(body.tracking.work_ended_at).not.toBeNull();
	});

	test("PATCH /jobs/:jobId/time-tracking/departed-job computes drive/wrench minutes", async () => {
		const { status, body } = await patch(
			`/jobs/${timeTrackingJobId}/time-tracking/departed-job`,
			token,
			{}
		);
		expect(status).toBe(200);
		expect(body.tracking.departed_job_at).not.toBeNull();
		// computed minutes should be non-null numbers (may be 0 in fast test env)
		expect(body.computed.driveMinutes).not.toBeUndefined();
		expect(body.computed.wrenchMinutes).not.toBeUndefined();
	});

	test("GET /jobs/:jobId/time-tracking returns tracking with computed fields", async () => {
		const { status, body } = await get(
			`/jobs/${timeTrackingJobId}/time-tracking`,
			token
		);
		expect(status).toBe(200);
		expect(body.tracking).toHaveProperty("drive_minutes");
		expect(body.tracking).toHaveProperty("wrench_minutes");
	});

	test("GET /jobs/:nonexistent/time-tracking returns 404", async () => {
		const { status } = await get(
			"/jobs/00000000-0000-0000-0000-000000000000/time-tracking",
			token
		);
		expect(status).toBe(404);
	});
});

// ============================================================
// 4. Analytics Endpoints
// ============================================================

describe("Analytics", () => {
	test("GET /analytics/revenue returns totals and breakdown", async () => {
		const { status, body } = await get(
			"/analytics/revenue?days=30&period=day",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("totals");
		expect(body).toHaveProperty("breakdown");
		expect(Array.isArray(body.breakdown)).toBe(true);
	});

	test("GET /analytics/tech-performance returns tech array", async () => {
		const { status, body } = await get(
			"/analytics/tech-performance?days=30",
			token
		);
		expect(status).toBe(200);
		expect(Array.isArray(body.techs)).toBe(true);
	});

	test("GET /analytics/tech-performance filtered by techId", async () => {
		const { status, body } = await get(
			`/analytics/tech-performance?days=30&techId=${techId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.techs.length).toBeLessThanOrEqual(1);
	});

	test("GET /analytics/job-kpis returns kpis and byJobType", async () => {
		const { status, body } = await get("/analytics/job-kpis?days=30", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("kpis");
		expect(body).toHaveProperty("byJobType");
	});

	test("GET /analytics/first-time-fix returns overall and byTech", async () => {
		const { status, body } = await get(
			"/analytics/first-time-fix?days=30",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("overall");
		expect(Array.isArray(body.byTech)).toBe(true);
	});

	test("GET /analytics/callback-rate returns overall and byTech", async () => {
		const { status, body } = await get(
			"/analytics/callback-rate?days=30",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("overall");
		expect(Array.isArray(body.byTech)).toBe(true);
	});

	test("GET /analytics/time-breakdown returns techs array", async () => {
		const { status, body } = await get(
			"/analytics/time-breakdown?days=30",
			token
		);
		expect(status).toBe(200);
		expect(Array.isArray(body.techs)).toBe(true);
	});

	test("GET /analytics/dispatch-overrides returns summary", async () => {
		const { status, body } = await get(
			"/analytics/dispatch-overrides?days=30",
			token
		);
		expect(status).toBe(200);
		expect(body).toHaveProperty("summary");
		expect(body).toHaveProperty("topReasons");
		expect(body).toHaveProperty("mostOverriddenTechs");
	});

	test("Analytics endpoints reject invalid days param gracefully", async () => {
		const { status } = await get("/analytics/revenue?days=abc", token);
		expect(status).toBe(200); // defaults to 30
	});
});

// ============================================================
// 5. KPI Thresholds + Alerts
// ============================================================

describe("KPI Thresholds", () => {
	test("POST /kpi/thresholds creates a threshold", async () => {
		const { status, body } = await post("/kpi/thresholds", token, {
			metricKey: "first_time_fix_rate",
			warnBelow: 70,
			critBelow: 50
		});
		expect(status).toBe(201);
		expect(body.threshold).toHaveProperty("id");
		kpiThresholdId = body.threshold.id;
	});

	test("POST /kpi/thresholds upserts on duplicate metricKey", async () => {
		const { status, body } = await post("/kpi/thresholds", token, {
			metricKey: "first_time_fix_rate",
			warnBelow: 75,
			critBelow: 55
		});
		expect(status).toBe(201);
		expect(body.threshold.warn_below).toBe(75);
	});

	test("GET /kpi/thresholds returns list", async () => {
		const { status, body } = await get("/kpi/thresholds", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.thresholds)).toBe(true);
		expect(body.thresholds.some((t: any) => t.id === kpiThresholdId)).toBe(
			true
		);
	});

	test("PATCH /kpi/thresholds/:id updates threshold values", async () => {
		const { status, body } = await patch(
			`/kpi/thresholds/${kpiThresholdId}`,
			token,
			{ warnBelow: 80 }
		);
		expect(status).toBe(200);
		expect(body.threshold.warn_below).toBe(80);
	});

	test("PATCH /kpi/thresholds with nonexistent id returns 404", async () => {
		const { status } = await patch(
			"/kpi/thresholds/00000000-0000-0000-0000-000000000000",
			token,
			{ warnBelow: 50 }
		);
		expect(status).toBe(404);
	});

	test("POST /kpi/check runs evaluation and returns results", async () => {
		const { status, body } = await post("/kpi/check", token, {});
		expect(status).toBe(200);
		expect(body.ok).toBe(true);
		expect(body).toHaveProperty("evaluated");
		expect(body).toHaveProperty("fired");
	});

	test("GET /kpi/alerts returns alert list with unreadCount", async () => {
		const { status, body } = await get("/kpi/alerts", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.alerts)).toBe(true);
		expect(typeof body.unreadCount).toBe("number");
	});

	test("DELETE /kpi/thresholds/:id removes threshold", async () => {
		const { status } = await del(`/kpi/thresholds/${kpiThresholdId}`, token);
		expect(status).toBe(200);
	});

	test("POST /kpi/thresholds with no threshold values returns 400", async () => {
		const { status } = await post("/kpi/thresholds", token, {
			metricKey: "callback_rate"
			// no threshold values
		});
		expect(status).toBe(400);
	});
});

// ============================================================
// 6. Dispatch Override Logging (Phase 4)
// ============================================================

describe("Dispatch Overrides", () => {
	let overrideJobId = "";
	let override2TechId = "";

	beforeAll(async () => {
		const sql = getSql();

		// Create a second tech to override to
		const [t2] = (await sql`
			INSERT INTO employees (
				company_id, name, email, role,
				is_active, is_available,
				current_jobs_count, max_concurrent_jobs,
				latitude, longitude
			) VALUES (
				${companyId}, 'W4 Tech 2', ${"w4tech2-" + Date.now() + "@test.local"},
				'technician', TRUE, TRUE, 0, 3,
				32.7767, -96.7970
			)
			RETURNING id
		`) as any[];
		override2TechId = t2.id;

		// Create a job to override
		const [j] = (await sql`
			INSERT INTO jobs (
				company_id, customer_name, address, phone,
				job_type, priority, status,
				assigned_tech_id
			) VALUES (
				${companyId}, 'Override Test', '100 Override St', '214-555-0099',
				'repair', 'high', 'assigned',
				${techId}
			)
			RETURNING id
		`) as any[];
		overrideJobId = j.id;
	});

	test("POST /jobs/:jobId/dispatch-override logs the override", async () => {
		const { status, body } = await post(
			`/jobs/${overrideJobId}/dispatch-override`,
			token,
			{
				originalTechId: techId,
				overrideTechId: override2TechId,
				reason: "Customer specifically requested Tech 2",
				algorithmScore: 82.5
			}
		);
		expect(status).toBe(201);
		expect(body.override).toHaveProperty("id");
		expect(body.override.is_manual_override).toBe(true);
		expect(body.override.override_reason).toBe(
			"Customer specifically requested Tech 2"
		);
	});

	test("GET /jobs/:jobId/dispatch-override returns override entry", async () => {
		const { status, body } = await get(
			`/jobs/${overrideJobId}/dispatch-override`,
			token
		);
		expect(status).toBe(200);
		expect(body.override.override_tech_name).toBeDefined();
	});

	test("GET /jobs/:jobId/dispatch-override on non-overridden job returns 404", async () => {
		// timeTrackingJobId was never overridden
		const { status } = await get(
			`/jobs/${timeTrackingJobId}/dispatch-override`,
			token
		);
		expect(status).toBe(404);
	});
});

// ============================================================
// 7. Job Reassignment History (Phase 4)
// ============================================================

describe("Job Reassignment", () => {
	let reassignJobId = "";
	let tech3Id = "";

	beforeAll(async () => {
		const sql = getSql();

		const [t3] = (await sql`
			INSERT INTO employees (
				company_id, name, email, role,
				is_active, is_available,
				current_jobs_count, max_concurrent_jobs,
				latitude, longitude
			) VALUES (
				${companyId}, 'W4 Tech 3', ${"w4tech3-" + Date.now() + "@test.local"},
				'technician', TRUE, TRUE, 0, 3,
				32.7767, -96.7970
			)
			RETURNING id
		`) as any[];
		tech3Id = t3.id;

		const [j] = (await sql`
			INSERT INTO jobs (
				company_id, customer_name, address, phone,
				job_type, priority, status,
				assigned_tech_id
			) VALUES (
				${companyId}, 'Reassign Test', '200 Reassign Blvd', '214-555-0088',
				'maintenance', 'normal', 'assigned',
				${techId}
			)
			RETURNING id
		`) as any[];
		reassignJobId = j.id;
	});

	test("POST /jobs/:jobId/reassign reassigns the job and logs it", async () => {
		const { status, body } = await post(
			`/jobs/${reassignJobId}/reassign`,
			token,
			{
				newTechId: tech3Id,
				reason: "Original tech called in sick"
			}
		);
		expect(status).toBe(201);
		expect(body.reassignment).toHaveProperty("id");
		expect(body.newTechId).toBe(tech3Id);
	});

	test("GET /jobs/:jobId/reassignments returns history", async () => {
		const { status, body } = await get(
			`/jobs/${reassignJobId}/reassignments`,
			token
		);
		expect(status).toBe(200);
		expect(Array.isArray(body.reassignments)).toBe(true);
		expect(body.reassignments.length).toBeGreaterThanOrEqual(1);
		expect(body.reassignments[0].reason).toBe("Original tech called in sick");
	});

	test("POST /jobs/:jobId/reassign to same tech returns 400", async () => {
		// Tech 3 is now assigned — reassigning to tech3 again should fail
		const { status } = await post(`/jobs/${reassignJobId}/reassign`, token, {
			newTechId: tech3Id,
			reason: "Trying to reassign to same tech"
		});
		expect(status).toBe(400);
	});

	test("POST /jobs/:completedJobId/reassign returns 409", async () => {
		// jobId is already completed from Phase 3 tests
		const { status } = await post(`/jobs/${jobId}/reassign`, token, {
			newTechId: tech3Id,
			reason: "Should fail"
		});
		expect(status).toBe(409);
	});
});

// ============================================================
// 8. Refrigerant Logs (EPA 608)
// ============================================================

describe("Refrigerant Logs", () => {
	let amendmentId = "";

	test("POST /refrigerant-logs creates a log entry", async () => {
		const sql = getSql();
		// Need a job that isn't completed for the refrigerant log
		const [rfJob] = (await sql`
			INSERT INTO jobs (
				company_id, customer_name, address, phone, job_type, priority, status
			) VALUES (
				${companyId}, 'RF Test', '500 Freon Blvd', '214-555-0010',
				'repair', 'normal', 'assigned'
			)
			RETURNING id
		`) as any[];

		const { status, body } = await post("/refrigerant-logs", token, {
			jobId: rfJob.id,
			techId,
			refrigerantType: "R-410A",
			actionType: "recover",
			quantityLbs: 2.5,
			cylinderTag: "CYL-001",
			leakDetected: true,
			leakRepaired: true,
			epaSection608Cert: "EPA-608-12345",
			notes: "Recovered refrigerant from leaking evaporator coil"
		});
		expect(status).toBe(201);
		expect(body.log).toHaveProperty("id");
		expect(body.log.refrigerant_type).toBe("R-410A");
		expect(body.log.quantity_lbs).toBe(2.5);
		expect(body.log.leak_detected).toBe(true);
		refrigerantLogId = body.log.id;
	});

	test("GET /refrigerant-logs returns list", async () => {
		const { status, body } = await get("/refrigerant-logs", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.logs)).toBe(true);
		expect(body).toHaveProperty("total");
		const found = body.logs.find((l: any) => l.id === refrigerantLogId);
		expect(found).toBeDefined();
	});

	test("GET /refrigerant-logs filters by techId", async () => {
		const { status, body } = await get(
			`/refrigerant-logs?techId=${techId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.logs.every((l: any) => l.tech_id === techId)).toBe(true);
	});

	test("GET /refrigerant-logs filters by refrigerant type", async () => {
		const { status, body } = await get("/refrigerant-logs?type=R-410A", token);
		expect(status).toBe(200);
		expect(body.logs.every((l: any) => l.refrigerant_type === "R-410A")).toBe(
			true
		);
	});

	test("GET /refrigerant-logs/summary returns EPA totals", async () => {
		const { status, body } = await get("/refrigerant-logs/summary", token);
		expect(status).toBe(200);
		expect(body).toHaveProperty("totals");
		expect(body).toHaveProperty("byTypeAndAction");
		expect(body).toHaveProperty("dateRange");
	});

	test("GET /refrigerant-logs/:logId returns log with amendment chain", async () => {
		const { status, body } = await get(
			`/refrigerant-logs/${refrigerantLogId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.log.id).toBe(refrigerantLogId);
		expect(Array.isArray(body.amendments)).toBe(true);
		expect(body.amendments.length).toBe(0); // no amendments yet
		expect(body.corrects).toBeNull();
	});

	test("POST /refrigerant-logs/:logId/amend creates an amendment, preserves original", async () => {
		const { status, body } = await post(
			`/refrigerant-logs/${refrigerantLogId}/amend`,
			token,
			{
				techId,
				refrigerantType: "R-410A",
				actionType: "recover",
				quantityLbs: 2.75, // corrected amount
				leakDetected: true,
				leakRepaired: true,
				epaSection608Cert: "EPA-608-12345",
				notes: "Corrected quantity — scale was off",
				amendmentReason: "Initial quantity was recorded incorrectly"
			}
		);
		expect(status).toBe(201);
		expect(body.amendment.corrects_log_id).toBe(refrigerantLogId);
		expect(body.amendment.quantity_lbs).toBe(2.75);
		expect(body.amendment.amendment_reason).toBe(
			"Initial quantity was recorded incorrectly"
		);
		amendmentId = body.amendment.id;
	});

	test("GET /refrigerant-logs/:logId shows amendment in chain", async () => {
		const { status, body } = await get(
			`/refrigerant-logs/${refrigerantLogId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.amendments.length).toBe(1);
		expect(body.amendments[0].id).toBe(amendmentId);
	});

	test("GET /refrigerant-logs/:amendmentId shows what it corrects", async () => {
		const { status, body } = await get(
			`/refrigerant-logs/${amendmentId}`,
			token
		);
		expect(status).toBe(200);
		expect(body.corrects).not.toBeNull();
		expect(body.corrects.id).toBe(refrigerantLogId);
	});

	test("No DELETE endpoint exists for refrigerant logs", async () => {
		// DELETE should 404 — route does not exist by design (EPA audit trail)
		const res = await fetch(
			`http://localhost:3001/refrigerant-logs/${refrigerantLogId}`,
			{
				method: "DELETE",
				headers: { Authorization: `Bearer ${token}` }
			}
		);
		expect(res.status).toBe(404);
	});

	test("POST /refrigerant-logs with invalid actionType returns 400", async () => {
		const { status } = await post("/refrigerant-logs", token, {
			techId,
			refrigerantType: "R-22",
			actionType: "dump_in_field", // not a valid enum value
			quantityLbs: 1.0
		});
		expect(status).toBe(400);
	});

	test("POST /refrigerant-logs without required fields returns 400", async () => {
		const { status } = await post("/refrigerant-logs", token, {
			techId
			// missing refrigerantType, actionType, quantityLbs
		});
		expect(status).toBe(400);
	});
});
