// tests/unit/afterHoursRouter.unit.test.ts
//
// Pure unit tests for after-hours window detection and on-call tech selection.
// DB is mocked via jest.mock — no live Neon calls.

jest.mock("@/db/connection", () => ({
	getSql: jest.fn()
}));

import { getSql } from "@/db/connection";
import {
	evaluateAfterHours,
	pickOnCallTech
} from "../../services/dispatch/afterHoursRouter";

const mockGetSql = getSql as jest.Mock;

/** Make getSql() return a tagged-template fn that always resolves to `rows` */
function mockDb(rows: unknown[]) {
	const fn = jest.fn().mockResolvedValue(rows);
	mockGetSql.mockReturnValue(fn);
}

// Shared rule fixture (midnight-wrapping weekday window 17:00–08:00)
const weekdayRule = {
	id: "rule-1",
	name: "Standard After-Hours",
	weekday_start: "17:00",
	weekday_end: "08:00",
	weekend_all_day: true,
	routing_strategy: "on_call_pool",
	on_call_employee_ids: ["emp-1", "emp-2"],
	surcharge_flat: "75.00",
	surcharge_percent: "0.00",
	auto_accept: false,
	notify_manager: true,
	manager_phone: "+12145550100"
};

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAfterHours — no rules
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAfterHours – no rules configured", () => {
	test("returns isAfterHours=false when company has no active rules", async () => {
		mockDb([]);
		const result = await evaluateAfterHours("co-1");
		expect(result.isAfterHours).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAfterHours — midnight-wrapping window (17:00 → 08:00)
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAfterHours – midnight-wrapping window (17:00–08:00)", () => {
	beforeEach(() => mockDb([weekdayRule]));

	test("6 PM Wednesday is after-hours", async () => {
		const at = new Date("2025-03-05T18:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("2 AM Wednesday is after-hours (crosses midnight)", async () => {
		const at = new Date("2025-03-05T02:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("10 AM Wednesday is NOT after-hours", async () => {
		const at = new Date("2025-03-05T10:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(false);
	});

	test("exactly 17:00 is after-hours (start boundary inclusive)", async () => {
		const at = new Date("2025-03-05T17:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("exactly 08:00 is NOT after-hours (end boundary exclusive)", async () => {
		const at = new Date("2025-03-05T08:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(false);
	});

	test("Saturday noon is after-hours (weekendAllDay=true)", async () => {
		const at = new Date("2025-03-08T12:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("Sunday 9 AM is after-hours (weekendAllDay=true)", async () => {
		const at = new Date("2025-03-09T09:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("returns routingStrategy and onCallEmployeeIds from rule", async () => {
		const at = new Date("2025-03-05T20:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.routingStrategy).toBe("on_call_pool");
		expect(result.onCallEmployeeIds).toEqual(["emp-1", "emp-2"]);
	});

	test("returns parsed surcharge and manager info", async () => {
		const at = new Date("2025-03-05T20:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.surchargeFlatFlat).toBe(75);
		expect(result.notifyManager).toBe(true);
		expect(result.managerPhone).toBe("+12145550100");
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// evaluateAfterHours — non-wrapping window (22:00–23:00)
// ─────────────────────────────────────────────────────────────────────────────

describe("evaluateAfterHours – non-wrapping window (22:00–23:00)", () => {
	beforeEach(() =>
		mockDb([{
			...weekdayRule,
			weekday_start: "22:00",
			weekday_end: "23:00",
			weekend_all_day: false,
			routing_strategy: "voicemail_queue",
			on_call_employee_ids: []
		}])
	);

	test("10:30 PM is after-hours (inside window)", async () => {
		const at = new Date("2025-03-05T22:30:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(true);
	});

	test("midnight is NOT after-hours (outside window)", async () => {
		const at = new Date("2025-03-05T00:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(false);
	});

	test("Saturday noon is NOT after-hours when weekendAllDay=false", async () => {
		const at = new Date("2025-03-08T12:00:00");
		const result = await evaluateAfterHours("co-1", null, at);
		expect(result.isAfterHours).toBe(false);
	});
});

// ─────────────────────────────────────────────────────────────────────────────
// pickOnCallTech
// ─────────────────────────────────────────────────────────────────────────────

describe("pickOnCallTech", () => {
	test("returns null immediately for empty pool without hitting DB", async () => {
		mockDb([]); // shouldn't even be called
		const result = await pickOnCallTech([]);
		expect(result).toBeNull();
	});

	test("returns the tech id from DB result", async () => {
		mockDb([{ id: "emp-1", is_available: true, active_jobs: 0 }]);
		const result = await pickOnCallTech(["emp-1", "emp-2"]);
		expect(result).toBe("emp-1");
	});

	test("returns null when no matching techs found in DB", async () => {
		mockDb([]);
		const result = await pickOnCallTech(["emp-99"]);
		expect(result).toBeNull();
	});
});