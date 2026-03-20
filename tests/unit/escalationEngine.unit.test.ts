// tests/unit/escalationEngine.unit.test.ts
//
// Unit tests for triggerEscalation, advanceEscalations, resolveEscalation.
// DB is fully mocked — no live Neon calls.

jest.mock("@/db/connection", () => ({
	getSql: jest.fn()
}));

import { getSql } from "@/db/connection";
import {
	triggerEscalation,
	advanceEscalations,
	resolveEscalation
} from "../../services/escalation/escalationEngine";

const mockGetSql = getSql as jest.Mock;

/**
 * Create a mock sql tagged-template function.
 * Each call to the mock returns the next item in `responses`.
 * Falls back to [] if responses are exhausted.
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
// triggerEscalation
// ─────────────────────────────────────────────────────────────────────────────

describe("triggerEscalation", () => {
	test("returns triggered=false with reason 'job not found' when job missing", async () => {
		makeSqlMock([
			[] // jobs query → empty
		]);
		const result = await triggerEscalation("non-existent-job");
		expect(result.triggered).toBe(false);
		expect(result.reason).toBe("job not found");
	});

	test("returns triggered=false for completed job", async () => {
		makeSqlMock([
			[
				{
					id: "j1",
					company_id: "co-1",
					branch_id: null,
					description: "AC repair",
					job_type: "repair",
					priority: "normal",
					status: "completed"
				}
			]
		]);
		const result = await triggerEscalation("j1");
		expect(result.triggered).toBe(false);
		expect(result.reason).toBe("job already terminal");
	});

	test("returns triggered=false for cancelled job", async () => {
		makeSqlMock([
			[
				{
					id: "j1",
					company_id: "co-1",
					branch_id: null,
					description: "",
					job_type: "repair",
					priority: "normal",
					status: "cancelled"
				}
			]
		]);
		const result = await triggerEscalation("j1");
		expect(result.triggered).toBe(false);
		expect(result.reason).toBe("job already terminal");
	});

	test("returns triggered=false when escalation already active", async () => {
		makeSqlMock([
			// jobs query
			[
				{
					id: "j1",
					company_id: "co-1",
					branch_id: null,
					description: "no heat",
					job_type: "repair",
					priority: "emergency",
					status: "unassigned"
				}
			],
			// existing active events query → found
			[{ id: "evt-existing" }]
		]);
		const result = await triggerEscalation("j1");
		expect(result.triggered).toBe(false);
		expect(result.reason).toBe("escalation already active");
		expect(result.eventId).toBe("evt-existing");
	});

	test("returns triggered=false when no matching policy", async () => {
		makeSqlMock([
			// jobs query
			[
				{
					id: "j1",
					company_id: "co-1",
					branch_id: null,
					description: "routine filter change",
					job_type: "maintenance",
					priority: "normal",
					status: "unassigned"
				}
			],
			// no existing events
			[],
			// policies — exists but keyword won't match "routine filter change"
			[
				{
					id: "pol-1",
					name: "Emergency",
					trigger_conditions: { keywords: ["no heat", "flooding"] },
					steps: []
				}
			]
		]);
		const result = await triggerEscalation("j1");
		expect(result.triggered).toBe(false);
		expect(result.reason).toBe("no matching policy");
	});

	test("triggers when job description matches policy keyword", async () => {
		makeSqlMock([
			// jobs query
			[
				{
					id: "j1",
					company_id: "co-1",
					branch_id: null,
					description: "customer says no heat at all",
					job_type: "repair",
					priority: "normal",
					status: "unassigned"
				}
			],
			// no existing events
			[],
			// matching policy
			[
				{
					id: "pol-1",
					name: "No Heat",
					trigger_conditions: { keywords: ["no heat"] },
					steps: [{ delayMinutes: 0, notify: ["manager"], channel: "sms" }]
				}
			],
			// INSERT RETURNING id
			[{ id: "evt-new" }],
			// executeEscalationStep UPDATE notification_log
			[]
		]);
		const result = await triggerEscalation("j1");
		expect(result.triggered).toBe(true);
		expect(result.eventId).toBe("evt-new");
	});

	test("triggers when job priority matches policy", async () => {
		makeSqlMock([
			[
				{
					id: "j2",
					company_id: "co-1",
					branch_id: null,
					description: "routine call",
					job_type: "inspection",
					priority: "emergency",
					status: "unassigned"
				}
			],
			[],
			[
				{
					id: "pol-2",
					name: "Emergency Priority",
					trigger_conditions: { priority: ["emergency"] },
					steps: [{ delayMinutes: 0, notify: ["dispatcher"], channel: "call" }]
				}
			],
			[{ id: "evt-2" }],
			[]
		]);
		const result = await triggerEscalation("j2");
		expect(result.triggered).toBe(true);
		expect(result.eventId).toBe("evt-2");
	});

	test("triggers when no conditions set (catch-all policy)", async () => {
		makeSqlMock([
			[
				{
					id: "j3",
					company_id: "co-1",
					branch_id: null,
					description: "anything",
					job_type: "repair",
					priority: "low",
					status: "unassigned"
				}
			],
			[],
			// Empty conditions object = match everything
			[
				{
					id: "pol-3",
					name: "Catch-all",
					trigger_conditions: {},
					steps: [{ delayMinutes: 0, notify: ["admin"], channel: "email" }]
				}
			],
			[{ id: "evt-3" }],
			[]
		]);
		const result = await triggerEscalation("j3");
		expect(result.triggered).toBe(true);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// advanceEscalations
// ─────────────────────────────────────────────────────────────────────────────

describe("advanceEscalations", () => {
	test("returns { advanced: 0, timedOut: 0 } when no active events", async () => {
		makeSqlMock([[]]);
		const result = await advanceEscalations();
		expect(result.advanced).toBe(0);
		expect(result.timedOut).toBe(0);
	});

	test("times out an event that has no more steps to advance to", async () => {
		makeSqlMock([
			// active events — current_step=0, steps=[one step only]
			[
				{
					id: "evt-1",
					current_step: 0,
					triggered_at: new Date(Date.now() - 30 * 60000).toISOString(),
					notification_log: [
						{ sentAt: new Date(Date.now() - 25 * 60000).toISOString() }
					],
					steps: [{ delayMinutes: 0, notify: ["tech"], channel: "sms" }] // only 1 step, nextStepIndex=1 >= length=1
				}
			],
			// UPDATE timed_out
			[]
		]);
		const result = await advanceEscalations();
		expect(result.timedOut).toBe(1);
		expect(result.advanced).toBe(0);
	});

	test("does NOT advance when delay has not yet elapsed", async () => {
		// notification was sent 2 minutes ago, next step needs 15 minutes
		makeSqlMock([
			[
				{
					id: "evt-1",
					current_step: 0,
					triggered_at: new Date(Date.now() - 5 * 60000).toISOString(),
					notification_log: [
						{ sentAt: new Date(Date.now() - 2 * 60000).toISOString() }
					],
					steps: [
						{ delayMinutes: 0, notify: ["tech"], channel: "sms" },
						{ delayMinutes: 15, notify: ["manager"], channel: "call" }
					]
				}
			]
			// No more SQL calls expected
		]);
		const result = await advanceEscalations();
		expect(result.advanced).toBe(0);
		expect(result.timedOut).toBe(0);
	});

	test("advances step when delay has elapsed", async () => {
		// notification was sent 20 minutes ago, next step needs 15 minutes
		makeSqlMock([
			[
				{
					id: "evt-1",
					current_step: 0,
					triggered_at: new Date(Date.now() - 25 * 60000).toISOString(),
					notification_log: [
						{ sentAt: new Date(Date.now() - 20 * 60000).toISOString() }
					],
					steps: [
						{ delayMinutes: 0, notify: ["tech"], channel: "sms" },
						{ delayMinutes: 15, notify: ["manager"], channel: "call" }
					]
				}
			],
			// executeEscalationStep UPDATE notification_log
			[],
			// UPDATE current_step
			[]
		]);
		const result = await advanceEscalations();
		expect(result.advanced).toBe(1);
		expect(result.timedOut).toBe(0);
	});

	test("handles multiple events in a single run", async () => {
		const now = Date.now();
		makeSqlMock([
			[
				// Event 1: will time out (no more steps)
				{
					id: "evt-a",
					current_step: 0,
					triggered_at: new Date(now - 60 * 60000).toISOString(),
					notification_log: [
						{ sentAt: new Date(now - 60 * 60000).toISOString() }
					],
					steps: [{ delayMinutes: 0, notify: ["tech"], channel: "sms" }]
				},
				// Event 2: delay elapsed, will advance
				{
					id: "evt-b",
					current_step: 0,
					triggered_at: new Date(now - 30 * 60000).toISOString(),
					notification_log: [
						{ sentAt: new Date(now - 25 * 60000).toISOString() }
					],
					steps: [
						{ delayMinutes: 0, notify: ["tech"], channel: "sms" },
						{ delayMinutes: 20, notify: ["manager"], channel: "call" }
					]
				}
			],
			[], // timed_out UPDATE for evt-a
			[], // notification_log UPDATE for evt-b
			[] // current_step UPDATE for evt-b
		]);
		const result = await advanceEscalations();
		expect(result.timedOut).toBe(1);
		expect(result.advanced).toBe(1);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveEscalation
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveEscalation", () => {
	test("calls DB update and resolves without error", async () => {
		const sqlFn = jest.fn().mockResolvedValue([]);
		mockGetSql.mockReturnValue(sqlFn);

		await expect(
			resolveEscalation("evt-1", "user-1", "Issue resolved on site")
		).resolves.toBeUndefined();

		expect(sqlFn).toHaveBeenCalledTimes(1);
	});

	test("resolves without error when notes is omitted", async () => {
		const sqlFn = jest.fn().mockResolvedValue([]);
		mockGetSql.mockReturnValue(sqlFn);

		await expect(resolveEscalation("evt-2", "user-2")).resolves.toBeUndefined();
	});
});
