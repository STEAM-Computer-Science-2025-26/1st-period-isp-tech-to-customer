// tests/unit/cronRunner.unit.test.ts
//
// Unit tests for all cron job functions.
// DB is fully mocked — no live Neon calls needed.

jest.mock("@/db/connection", () => ({
	getSql: jest.fn()
}));

import { getSql } from "@/db/connection";
import {
	processRecurringSchedules,
	processMembershipRenewals,
	processBillingTriggers,
	scheduleReviewRequests,
	dispatchPendingReviewRequests
} from "../../services/cron/cronRunner";

const mockGetSql = getSql as jest.Mock;

/**
 * Returns a sql mock where each template-tag call returns the next response.
 * Falls back to [] if responses run out.
 */
function makeSqlMock(responses: unknown[][]) {
	let i = 0;
	const fn = jest
		.fn()
		.mockImplementation(() => Promise.resolve(responses[i++] ?? []));
	mockGetSql.mockReturnValue(fn);
	return fn;
}

// ─────────────────────────────────────────────────────────────────────────────
// processRecurringSchedules
// ─────────────────────────────────────────────────────────────────────────────

describe("processRecurringSchedules", () => {
	test("returns zeros when no schedules are due", async () => {
		makeSqlMock([
			[] // SELECT from recurring_job_schedules → nothing due
		]);
		const result = await processRecurringSchedules();
		expect(result.processed).toBe(0);
		expect(result.created).toBe(0);
		expect(result.errors).toBe(0);
	});

	test("creates one job and advances next_run_at for a due schedule", async () => {
		const schedule = {
			id: "sched-1",
			company_id: "co-1",
			branch_id: null,
			customer_id: "cust-1",
			customer_name: "Jane Doe",
			customer_phone: "+12145550101",
			title: "Spring AC Tune-Up",
			description: null,
			job_type: "maintenance",
			preferred_tech_id: null,
			duration_minutes: 60,
			next_run_at: "2025-04-01",
			advance_days: 3,
			frequency: "annual",
			address: "123 Main St",
			city: "Dallas",
			state: "TX",
			zip: "75001"
		};
		makeSqlMock([
			[schedule], // SELECT schedules
			[{ id: "job-new" }], // INSERT jobs RETURNING id
			[] // UPDATE recurring_job_schedules next_run_at
		]);
		const result = await processRecurringSchedules();
		expect(result.processed).toBe(1);
		expect(result.created).toBe(1);
		expect(result.errors).toBe(0);
	});

	test("counts error and continues when job INSERT fails", async () => {
		const schedule = {
			id: "sched-bad",
			company_id: "co-1",
			branch_id: null,
			customer_id: "cust-1",
			customer_name: "John Smith",
			customer_phone: null,
			title: "Maintenance",
			description: null,
			job_type: "maintenance",
			preferred_tech_id: null,
			duration_minutes: 60,
			next_run_at: "2025-04-01",
			advance_days: 3,
			frequency: "quarterly",
			address: "456 Oak Ave",
			city: "Dallas",
			state: "TX",
			zip: "75002"
		};
		// SELECT returns schedule, then INSERT throws
		const sqlFn = jest
			.fn()
			.mockResolvedValueOnce([schedule])
			.mockRejectedValueOnce(new Error("DB constraint violation"));
		mockGetSql.mockReturnValue(sqlFn);

		const result = await processRecurringSchedules();
		expect(result.processed).toBe(1);
		expect(result.errors).toBe(1);
		expect(result.created).toBe(0);
	});

	test("creates jobs for multiple due schedules", async () => {
		const makeSchedule = (id: string, freq: string) => ({
			id,
			company_id: "co-1",
			branch_id: null,
			customer_id: "cust-1",
			customer_name: "Alice",
			customer_phone: null,
			title: "Maintenance",
			description: null,
			job_type: "maintenance",
			preferred_tech_id: null,
			duration_minutes: 60,
			next_run_at: "2025-04-01",
			advance_days: 3,
			frequency: freq,
			address: "123 Main",
			city: "Dallas",
			state: "TX",
			zip: "75001"
		});
		makeSqlMock([
			[makeSchedule("s1", "monthly"), makeSchedule("s2", "quarterly")],
			[{ id: "job-1" }],
			[], // schedule 1: INSERT + UPDATE
			[{ id: "job-2" }],
			[] // schedule 2: INSERT + UPDATE
		]);
		const result = await processRecurringSchedules();
		expect(result.processed).toBe(2);
		expect(result.created).toBe(2);
		expect(result.errors).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// processMembershipRenewals
// ─────────────────────────────────────────────────────────────────────────────

describe("processMembershipRenewals", () => {
	test("returns zeros when nothing to process", async () => {
		makeSqlMock([
			[], // expiring soon
			[] // expired agreements UPDATE RETURNING
		]);
		const result = await processMembershipRenewals();
		expect(result.reminded).toBe(0);
		expect(result.expired).toBe(0);
		expect(result.renewed).toBe(0);
	});

	test("sends reminder and increments reminded count", async () => {
		const expiring = [
			{
				id: "agr-1",
				customer_name: "John Smith",
				tier_name: "Gold",
				expires_at: "2025-03-20",
				email: "john@example.com",
				phone: "+12145550101"
			}
		];
		makeSqlMock([
			expiring, // expiringSoon
			[], // UPDATE renewal_notified_at
			[] // expired UPDATE RETURNING
		]);
		const result = await processMembershipRenewals();
		expect(result.reminded).toBe(1);
		expect(result.expired).toBe(0);
	});

	test("marks expired agreements and auto-renews eligible ones", async () => {
		const expired = [
			{
				id: "agr-old",
				company_id: "co-1",
				customer_id: "cust-1",
				tier_id: "tier-1",
				billing_cycle: "annual",
				price_locked: "299.00",
				auto_renew: true,
				visits_allowed: 2
			}
		];
		makeSqlMock([
			[], // expiringSoon (none)
			expired, // UPDATE expired RETURNING
			[{ id: "agr-new" }], // INSERT new agreement RETURNING
			[] // INSERT billing_trigger_log
		]);
		const result = await processMembershipRenewals();
		expect(result.expired).toBe(1);
		expect(result.renewed).toBe(1);
	});

	test("does NOT auto-renew agreements with auto_renew=false", async () => {
		const expired = [
			{
				id: "agr-no-renew",
				company_id: "co-1",
				customer_id: "cust-1",
				tier_id: "tier-1",
				billing_cycle: "annual",
				price_locked: "149.00",
				auto_renew: false,
				visits_allowed: 1
			}
		];
		makeSqlMock([
			[], // expiringSoon
			expired // UPDATE expired RETURNING
			// No INSERT calls expected
		]);
		const result = await processMembershipRenewals();
		expect(result.expired).toBe(1);
		expect(result.renewed).toBe(0);
	});

	test("counts multiple reminders and renewals correctly", async () => {
		makeSqlMock([
			// Two expiring-soon agreements
			[
				{
					id: "agr-a",
					customer_name: "Alice",
					tier_name: "Silver",
					expires_at: "2025-03-15",
					email: "a@a.com",
					phone: null
				},
				{
					id: "agr-b",
					customer_name: "Bob",
					tier_name: "Gold",
					expires_at: "2025-03-18",
					email: null,
					phone: "+1214"
				}
			],
			[], // UPDATE agr-a renewal_notified_at
			[], // UPDATE agr-b renewal_notified_at
			// Two expired with auto_renew=true
			[
				{
					id: "agr-x",
					company_id: "co-1",
					customer_id: "c1",
					tier_id: "t1",
					billing_cycle: "annual",
					price_locked: "200",
					auto_renew: true,
					visits_allowed: 1
				},
				{
					id: "agr-y",
					company_id: "co-1",
					customer_id: "c2",
					tier_id: "t1",
					billing_cycle: "annual",
					price_locked: "200",
					auto_renew: true,
					visits_allowed: 1
				}
			],
			[{ id: "new-x" }],
			[], // INSERT + billing_trigger for agr-x
			[{ id: "new-y" }],
			[] // INSERT + billing_trigger for agr-y
		]);
		const result = await processMembershipRenewals();
		expect(result.reminded).toBe(2);
		expect(result.expired).toBe(2);
		expect(result.renewed).toBe(2);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// processBillingTriggers
// ─────────────────────────────────────────────────────────────────────────────

describe("processBillingTriggers", () => {
	test("returns zeros when no pending triggers", async () => {
		makeSqlMock([[]]);
		const result = await processBillingTriggers();
		expect(result.processed).toBe(0);
		expect(result.invoiced).toBe(0);
		expect(result.failed).toBe(0);
	});

	test("creates invoice for a pending billing trigger", async () => {
		const trigger = {
			id: "trig-1",
			agreement_id: "agr-1",
			company_id: "co-1",
			customer_id: "cust-1",
			price_locked: "299.00",
			billing_cycle: "annual"
		};
		makeSqlMock([
			[trigger], // SELECT pending triggers
			[{ seq: "1042" }], // SELECT nextval
			[{ id: "inv-new" }], // INSERT invoices RETURNING id
			[], // INSERT invoice_line_items
			[] // UPDATE billing_trigger_log success
		]);
		const result = await processBillingTriggers();
		expect(result.processed).toBe(1);
		expect(result.invoiced).toBe(1);
		expect(result.failed).toBe(0);
	});

	test("marks trigger as failed when invoice creation throws", async () => {
		const trigger = {
			id: "trig-fail",
			agreement_id: "agr-2",
			company_id: "co-1",
			customer_id: "cust-2",
			price_locked: "199.00",
			billing_cycle: "monthly"
		};
		const sqlFn = jest
			.fn()
			.mockResolvedValueOnce([trigger]) // SELECT pending
			.mockRejectedValueOnce(new Error("sequence failure")) // nextval throws
			.mockResolvedValueOnce([]); // UPDATE failed status
		mockGetSql.mockReturnValue(sqlFn);

		const result = await processBillingTriggers();
		expect(result.processed).toBe(1);
		expect(result.invoiced).toBe(0);
		expect(result.failed).toBe(1);
	});

	test("processes multiple triggers independently", async () => {
		const triggers = [
			{
				id: "t1",
				agreement_id: "a1",
				company_id: "co-1",
				customer_id: "c1",
				price_locked: "100.00",
				billing_cycle: "monthly"
			},
			{
				id: "t2",
				agreement_id: "a2",
				company_id: "co-1",
				customer_id: "c2",
				price_locked: "200.00",
				billing_cycle: "annual"
			}
		];
		makeSqlMock([
			triggers, // SELECT
			[{ seq: "1" }], // nextval t1
			[{ id: "inv-1" }], // INSERT invoice t1
			[], // INSERT line item t1
			[], // UPDATE success t1
			[{ seq: "2" }], // nextval t2
			[{ id: "inv-2" }], // INSERT invoice t2
			[], // INSERT line item t2
			[] // UPDATE success t2
		]);
		const result = await processBillingTriggers();
		expect(result.processed).toBe(2);
		expect(result.invoiced).toBe(2);
		expect(result.failed).toBe(0);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// scheduleReviewRequests
// ─────────────────────────────────────────────────────────────────────────────

describe("scheduleReviewRequests", () => {
	test("returns { scheduled: 0 } when no recently completed jobs", async () => {
		makeSqlMock([[]]);
		const result = await scheduleReviewRequests();
		expect(result.scheduled).toBe(0);
	});

	test("schedules review for a completed job with phone (sms channel)", async () => {
		const job = {
			id: "job-1",
			company_id: "co-1",
			customer_id: "cust-1",
			completed_at: new Date(Date.now() - 60 * 60000).toISOString(),
			phone: "+12145550123",
			email: null
		};
		makeSqlMock([
			[job], // SELECT completed jobs
			[] // INSERT review_requests
		]);
		const result = await scheduleReviewRequests();
		expect(result.scheduled).toBe(1);
	});

	test("schedules review for a completed job with email (email channel)", async () => {
		const job = {
			id: "job-2",
			company_id: "co-1",
			customer_id: "cust-1",
			completed_at: new Date(Date.now() - 60 * 60000).toISOString(),
			phone: null,
			email: "customer@example.com"
		};
		makeSqlMock([[job], []]);
		const result = await scheduleReviewRequests();
		expect(result.scheduled).toBe(1);
	});

	test("schedules reviews for multiple jobs", async () => {
		const jobs = [
			{
				id: "j1",
				company_id: "co-1",
				customer_id: "c1",
				completed_at: new Date().toISOString(),
				phone: "+1214",
				email: null
			},
			{
				id: "j2",
				company_id: "co-1",
				customer_id: "c2",
				completed_at: new Date().toISOString(),
				phone: null,
				email: "b@b.com"
			}
		];
		makeSqlMock([[...jobs], [], []]);
		const result = await scheduleReviewRequests();
		expect(result.scheduled).toBe(2);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// dispatchPendingReviewRequests
// ─────────────────────────────────────────────────────────────────────────────

describe("dispatchPendingReviewRequests", () => {
	test("returns { sent: 0, failed: 0 } when no due requests", async () => {
		makeSqlMock([[]]);
		const result = await dispatchPendingReviewRequests();
		expect(result.sent).toBe(0);
		expect(result.failed).toBe(0);
	});

	test("marks request as sent successfully", async () => {
		const req = {
			id: "rev-1",
			customer_id: "cust-1",
			job_id: "job-1",
			channel: "sms",
			phone: "+12145550123",
			email: null,
			first_name: "John",
			company_name: "Cool Air Co"
		};
		makeSqlMock([
			[req], // SELECT due requests
			[] // UPDATE sent
		]);
		const result = await dispatchPendingReviewRequests();
		expect(result.sent).toBe(1);
		expect(result.failed).toBe(0);
	});

	test("marks request as failed when UPDATE throws", async () => {
		const req = {
			id: "rev-fail",
			customer_id: "cust-1",
			job_id: "job-1",
			channel: "email",
			phone: null,
			email: "x@x.com",
			first_name: "Jane",
			company_name: "AC Pro"
		};
		const sqlFn = jest
			.fn()
			.mockResolvedValueOnce([req]) // SELECT
			.mockRejectedValueOnce(new Error("send failed")) // UPDATE sent throws
			.mockResolvedValueOnce([]); // UPDATE failed status
		mockGetSql.mockReturnValue(sqlFn);

		const result = await dispatchPendingReviewRequests();
		expect(result.sent).toBe(0);
		expect(result.failed).toBe(1);
	});

	test("handles mixed success and failure across multiple requests", async () => {
		const requests = [
			{
				id: "r1",
				customer_id: "c1",
				job_id: "j1",
				channel: "sms",
				phone: "+1",
				email: null,
				first_name: "A",
				company_name: "Co"
			},
			{
				id: "r2",
				customer_id: "c2",
				job_id: "j2",
				channel: "email",
				phone: null,
				email: "b@b.com",
				first_name: "B",
				company_name: "Co"
			}
		];
		const sqlFn = jest
			.fn()
			.mockResolvedValueOnce(requests) // SELECT
			.mockResolvedValueOnce([]) // UPDATE sent r1 (success)
			.mockRejectedValueOnce(new Error("smtp timeout")) // UPDATE sent r2 (throws)
			.mockResolvedValueOnce([]); // UPDATE failed r2
		mockGetSql.mockReturnValue(sqlFn);

		const result = await dispatchPendingReviewRequests();
		expect(result.sent).toBe(1);
		expect(result.failed).toBe(1);
	});
});
