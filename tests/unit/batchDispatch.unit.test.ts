import { batchDispatch } from "../../services/dispatch/batchDispatch";
import { getSql } from "../../db";

describe("Batch Dispatch – unit tests", () => {
	let companyId: string;
	const sql = getSql();

	beforeAll(async () => {
		// Create a test company and RETURN its id
		const companyResult = (await sql`
			INSERT INTO companies (name, settings)
			VALUES ('BatchTest Co', '{}')
			RETURNING id
		`) as unknown as { id: string }[];

		companyId = companyResult[0].id;
	});

	afterAll(async () => {
		// Clean up test data
		await sql`
			DELETE FROM companies
			WHERE id = ${companyId}
		`;
	});

	test("dispatches jobs without crashing", async () => {
		const results = await batchDispatch([], companyId);

		expect(results).toBeDefined();
		expect(results.assignments).toBeDefined();
		expect(results.assignments).toHaveLength(0);
		expect(results.stats.totalJobs).toBe(0);
	});

	test("handles empty job list gracefully", async () => {
		const results = await batchDispatch([], companyId);

		expect(results.assignments).toHaveLength(0);
		expect(results.stats.totalJobs).toBe(0);
	});
});
