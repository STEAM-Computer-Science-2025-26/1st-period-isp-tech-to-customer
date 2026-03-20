// /db/test-connection.ts
// Run this with: npx tsx db/test-connection.ts

import { getSql, testConnection, toCamelCase } from "./connection";
import { randomBytes } from "node:crypto";

async function runTests() {
	console.log("🔍 Testing Neon Database Connection...\n");

	// Test 1: Basic connection
	const { success: connected, error, currentTime } = await testConnection();

	if (!connected) {
		console.error(
			"❌ Connection test failed. Check your DATABASE_URL in .env.local",
			error
		);
		process.exit(1);
	}

	console.log("✅ Database connected successfully! Current time:", currentTime);
	console.log("\n📊 Testing schema...\n");

	// Test 2: Check if tables exist
	try {
		const sql = getSql();
		const rows = (await sql`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public'
      ORDER BY table_name
    `) as { table_name: string }[];

		const tables = rows.map(toCamelCase<{ tableName: string }>);

		console.log("✅ Tables in database:");
		tables.forEach((t) => console.log(`   - ${t.tableName}`));

		const expectedTables = ["companies", "users", "employees", "jobs"];
		const existingTables = tables.map((t) => t.tableName);
		const missingTables = expectedTables.filter(
			(t) => !existingTables.includes(t)
		);

		const requiredEmailVerificationTable = "email_verifications";
		const hasEmailVerificationTable = existingTables.includes(
			requiredEmailVerificationTable
		);

		if (missingTables.length > 0 || !hasEmailVerificationTable) {
			console.warn("\n⚠️  Missing tables:", missingTables.join(", "));
			if (!hasEmailVerificationTable) {
				console.warn("⚠️  Missing table:", requiredEmailVerificationTable);
			}
			console.log("Run the SQL from db/schema.sql in your Neon SQL Editor");
			process.exit(1);
		} else {
			console.log("\n✅ All required tables exist!");
		}
	} catch (err) {
		console.error("❌ Error checking schema:", err);
		process.exit(1);
	}

	console.log("\n🧪 Testing email verification table...\n");

	// Test 3: Insert/select/delete against email_verifications
	try {
		const sql = getSql();
		const tokenHash = randomBytes(32).toString("hex");
		const sessionHash = randomBytes(32).toString("hex");
		const email = "test@example.com";
		const expiresAt = new Date(Date.now() + 30 * 60_000).toISOString();

		await sql`
			INSERT INTO email_verifications (
				email,
				token_hash,
				session_hash,
				expires_at,
				verified,
				use_code,
				code_attempts
			)
			VALUES (
				${email},
				${tokenHash},
				${sessionHash},
				${expiresAt},
				FALSE,
				FALSE,
				0
			)
		`;

		const rows = await sql`
			SELECT email, token_hash, session_hash, verified, use_code
			FROM email_verifications
			WHERE token_hash = ${tokenHash}
			LIMIT 1
		`;

		if (!rows[0]) {
			throw new Error("Insert succeeded but row could not be read back");
		}

		console.log("✅ email_verifications insert/select OK:");
		console.log({
			email: rows[0].email,
			tokenHash: rows[0].token_hash,
			sessionHash: rows[0].session_hash,
			verified: rows[0].verified,
			useCode: rows[0].use_code
		});

		await sql`
			DELETE FROM email_verifications
			WHERE token_hash = ${tokenHash}
		`;

		console.log("✅ email_verifications cleanup OK");
	} catch (err) {
		console.error("❌ email_verifications test failed:", err);
		console.log(
			"Did you run the updated db/schema.sql (including email_verifications) in Neon?"
		);
		process.exit(1);
	}

	console.log("\n✨ Connection test complete!\n");
}

runTests().catch((err) => {
	console.error("❌ Unexpected error during tests:", err);
	process.exit(1);
});
