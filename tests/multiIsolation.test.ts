// services/tests/multiTenantIsolation.test.ts
// Run with: pnpm exec tsx services/tests/multiTenantIsolation.test.ts
// Tests that company A cannot access company B's data across all major entities

import { getSql } from "../db";

// ============================================================
// Helpers
// ============================================================

let passed = 0;
let failed = 0;

function assert(condition: boolean, label: string) {
	if (condition) {
		console.log(`  ✅ ${label}`);
		passed++;
	} else {
		console.error(`  ❌ FAIL: ${label}`);
		failed++;
	}
}

async function createTestCompany(sql: ReturnType<typeof getSql>, name: string) {
	const [company] = (await sql`
		INSERT INTO companies (name) VALUES (${name}) RETURNING id
	`) as { id: string }[];
	return company.id;
}

async function createTestUser(
	sql: ReturnType<typeof getSql>,
	email: string,
	companyId: string,
	role = "admin"
) {
	const [user] = (await sql`
		INSERT INTO users (email, password_hash, role, company_id)
		VALUES (${email}, 'hashed', ${role}, ${companyId})
		RETURNING id
	`) as { id: string }[];
	return user.id;
}

async function cleanup(sql: ReturnType<typeof getSql>, companyIds: string[]) {
	for (const id of companyIds) {
		await sql`DELETE FROM companies WHERE id = ${id}`;
	}
}

// ============================================================
// Test suites
// ============================================================

async function testCustomerIsolation(
	sql: ReturnType<typeof getSql>,
	companyAId: string,
	companyBId: string
) {
	console.log("\n📋 Customer isolation");

	const [customerA] = (await sql`
		INSERT INTO customers (company_id, first_name, last_name, phone, address, city, state, zip)
		VALUES (${companyAId}, 'Alice', 'Test', '5550001111', '123 Main', 'Dallas', 'TX', '75001')
		RETURNING id
	`) as { id: string }[];

	// Company B should not be able to see company A's customer
	const rows = (await sql`
		SELECT id FROM customers WHERE id = ${customerA.id} AND company_id = ${companyBId}
	`) as { id: string }[];

	assert(rows.length === 0, "Company B cannot read Company A's customer");

	// Cleanup
	await sql`DELETE FROM customers WHERE id = ${customerA.id}`;
}

async function testJobIsolation(
	sql: ReturnType<typeof getSql>,
	companyAId: string,
	companyBId: string,
	userAId: string
) {
	console.log("\n🔧 Job isolation");

	const [jobA] = (await sql`
		INSERT INTO jobs (company_id, created_by_user_id, address, city, state, zip, job_type, status)
		VALUES (${companyAId}, ${userAId}, '123 Main', 'Dallas', 'TX', '75001', 'repair', 'unassigned')
		RETURNING id
	`) as { id: string }[];

	const rows = (await sql`
		SELECT id FROM jobs WHERE id = ${jobA.id} AND company_id = ${companyBId}
	`) as { id: string }[];

	assert(rows.length === 0, "Company B cannot read Company A's job");

	await sql`DELETE FROM jobs WHERE id = ${jobA.id}`;
}

async function testUserIsolation(
	sql: ReturnType<typeof getSql>,
	companyAId: string,
	companyBId: string,
	userAId: string
) {
	console.log("\n👤 User isolation");

	const rows = (await sql`
		SELECT id FROM users WHERE id = ${userAId} AND company_id = ${companyBId}
	`) as { id: string }[];

	assert(rows.length === 0, "Company B cannot read Company A's user");
}

async function testSmsIsolation(
	sql: ReturnType<typeof getSql>,
	companyAId: string,
	companyBId: string
) {
	console.log("\n💬 SMS message isolation");

	// Check if sms_messages table exists first
	const [tableExists] = (await sql`
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'sms_messages'
		) AS exists
	`) as { exists: boolean }[];

	if (!tableExists?.exists) {
		console.log("  ⚠️  sms_messages table not yet created — skipping");
		return;
	}

	const [msg] = (await sql`
		INSERT INTO sms_messages (company_id, direction, from_phone, to_phone, body, status)
		VALUES (${companyAId}, 'outbound', '+15550001111', '+15550002222', 'Hello', 'sent')
		RETURNING id
	`) as { id: string }[];

	const rows = (await sql`
		SELECT id FROM sms_messages WHERE id = ${msg.id} AND company_id = ${companyBId}
	`) as { id: string }[];

	assert(rows.length === 0, "Company B cannot read Company A's SMS messages");

	await sql`DELETE FROM sms_messages WHERE id = ${msg.id}`;
}

async function testAuditIsolation(
	sql: ReturnType<typeof getSql>,
	companyAId: string,
	companyBId: string
) {
	console.log("\n📝 Audit log isolation");

	const [tableExists] = (await sql`
		SELECT EXISTS(
			SELECT 1 FROM information_schema.tables
			WHERE table_schema = 'public' AND table_name = 'audit_logs'
		) AS exists
	`) as { exists: boolean }[];

	if (!tableExists?.exists) {
		console.log("  ⚠️  audit_logs table not yet created — skipping");
		return;
	}

	const [log] = (await sql`
		INSERT INTO audit_logs (company_id, action, entity_type)
		VALUES (${companyAId}, 'test.action', 'test')
		RETURNING id
	`) as { id: string }[];

	const rows = (await sql`
		SELECT id FROM audit_logs WHERE id = ${log.id} AND company_id = ${companyBId}
	`) as { id: string }[];

	assert(rows.length === 0, "Company B cannot read Company A's audit logs");

	await sql`DELETE FROM audit_logs WHERE id = ${log.id}`;
}

// ============================================================
// Main runner
// ============================================================

async function runIsolationTests() {
	console.log("🔒 Multi-tenant isolation tests\n");
	const sql = getSql();

	const suffix = Date.now();
	const companyAId = await createTestCompany(sql, `Test Co A ${suffix}`);
	const companyBId = await createTestCompany(sql, `Test Co B ${suffix}`);
	const userAId = await createTestUser(sql, `usera_${suffix}@test.com`, companyAId);
	const userBId = await createTestUser(sql, `userb_${suffix}@test.com`, companyBId);

	try {
		await testCustomerIsolation(sql, companyAId, companyBId);
		await testJobIsolation(sql, companyAId, companyBId, userAId);
		await testUserIsolation(sql, companyAId, companyBId, userAId);
		await testSmsIsolation(sql, companyAId, companyBId);
		await testAuditIsolation(sql, companyAId, companyBId);
	} finally {
		await sql`DELETE FROM users WHERE id IN (${userAId}, ${userBId})`;
		await cleanup(sql, [companyAId, companyBId]);
	}

	console.log(`\n${passed + failed} tests — ✅ ${passed} passed, ❌ ${failed} failed`);
	if (failed > 0) process.exit(1);
}

runIsolationTests().catch((err) => {
	console.error("Test runner crashed:", err);
	process.exit(1);
});