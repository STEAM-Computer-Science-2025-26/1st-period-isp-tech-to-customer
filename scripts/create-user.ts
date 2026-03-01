// scripts/create-user.ts
// Run with: pnpm exec tsx scripts/create-user.ts

import "dotenv/config";
import { getSql } from "../db/connection";
import bcrypt from "bcryptjs";

const EMAIL = "dev@test.com";
const PASSWORD = "Test1234!";

async function main() {
	const sql = getSql();

	// Check if user already exists
	const existing = await sql`SELECT id FROM users WHERE email = ${EMAIL}`;
	if (existing.length > 0) {
		console.log(`✅ User already exists: ${EMAIL}`);
		process.exit(0);
	}

	// Get first company
	const [company] = await sql`SELECT id FROM companies LIMIT 1`;
	if (!company) {
		console.error("❌ No companies found. Run the seed script first.");
		process.exit(1);
	}

	const hash = await bcrypt.hash(PASSWORD, 10);

	const [user] = await sql`
		INSERT INTO users (email, password_hash, role, company_id)
		VALUES (${EMAIL}, ${hash}, 'admin', ${company.id})
		RETURNING id, email, role, company_id
	`;

	console.log("✅ User created!");
	console.log(`   Email:      ${EMAIL}`);
	console.log(`   Password:   ${PASSWORD}`);
	console.log(`   Company ID: ${company.id}`);
	console.log(`   User ID:    ${user.id}`);
}

main().catch((err) => {
	console.error("❌ Failed:", err);
	process.exit(1);
});
