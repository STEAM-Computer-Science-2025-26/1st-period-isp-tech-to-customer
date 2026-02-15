import { Pool } from "pg"; // create a Postgres pool here
const pool = new Pool({
	// Use DATABASE_URL in production or fallback to a local DB for development.
	connectionString:
		process.env.DATABASE_URL || "postgresql://user:pass@localhost:5432/mydb"
});

async function updateJobAssignments() {
	const client = await pool.connect();
	try {
		await client.query(
			"UPDATE job_assignments SET new_job_id = $1 WHERE job_id = $2",
			[
				"e396b39c-fec0-4d6d-ab44-0c20fc9f578b",
				"10101010-1010-1010-1010-101010101010"
			]
		);
		console.log("Update complete");
	} finally {
		client.release();
	}
}

updateJobAssignments().catch(console.error);
