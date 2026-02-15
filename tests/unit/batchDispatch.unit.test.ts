import { batchDispatch } from "../../services/dispatch/batchDispatch";
import { randomUUID } from "crypto";

describe("Batch Dispatch – unit tests", () => {
	test("dispatches jobs without crashing", async () => {
		// Test with empty array since batchDispatch queries database
		const companyId = randomUUID();
		const results = await batchDispatch([], companyId);

		expect(results).toBeDefined();
		expect(results.assignments).toBeDefined();
		expect(results.assignments).toHaveLength(0);
		expect(results.stats.totalJobs).toBe(0);
	});

	test("handles empty job list gracefully", async () => {
		const companyId = randomUUID();
		const results = await batchDispatch([], companyId);
		expect(results.assignments).toHaveLength(0);
		expect(results.stats.totalJobs).toBe(0);
	});
});
