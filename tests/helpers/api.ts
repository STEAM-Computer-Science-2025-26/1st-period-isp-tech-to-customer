// tests/helpers/api.ts
// Shared utilities for integration tests.
// All tests hit the real running server at localhost:3001.
// Each suite seeds its own data and cleans up after itself.

import "dotenv/config";
import { getSql } from "../../db";
const sql = getSql();
export const BASE = "http://localhost:3001";

// ============================================================
// HTTP helpers
// ============================================================

export async function get(path: string, token: string) {
	const res = await fetch(`${BASE}${path}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	return { status: res.status, body: await res.json() };
}

export async function post(path: string, token: string, body: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.json() };
}

export async function patch(path: string, token: string, body: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method: "PATCH",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.json() };
}

export async function put(path: string, token: string, body: unknown) {
	const res = await fetch(`${BASE}${path}`, {
		method: "PUT",
		headers: {
			Authorization: `Bearer ${token}`,
			"Content-Type": "application/json"
		},
		body: JSON.stringify(body)
	});
	return { status: res.status, body: await res.json() };
}

export async function del(path: string, token: string) {
	const res = await fetch(`${BASE}${path}`, {
		method: "DELETE",
		headers: { Authorization: `Bearer ${token}` }
	});
	return { status: res.status, body: await res.json() };
}

// ============================================================
// Auth
// ============================================================

export async function getToken(
	email: string,
	password: string
): Promise<string> {
	const res = await fetch(`${BASE}/login`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ email, password })
	});
	const body = (await res.json()) as any;
	if (!body.token)
		throw new Error(`Login failed for ${email}: ${JSON.stringify(body)}`);
	return body.token;
}

// ============================================================
// Seed helpers — create test data directly in DB
// ============================================================

export async function seedCompanyAndUser(suffix: string) {
	const sql = getSql();
	const bcrypt = await import("bcryptjs");
	const hash = await bcrypt.hash("TestPass123!", 10);
	const email = `test-${suffix}-${Date.now()}@testco.local`;

	const [company] = (await sql`
		INSERT INTO companies (name) VALUES (${"TestCo-" + suffix})
		RETURNING id
	`) as any[];

	const [user] = (await sql`
		INSERT INTO users (email, password_hash, role, company_id)
		VALUES (${email}, ${hash}, 'admin', ${company.id})
		RETURNING id
	`) as any[];

	const token = await getToken(email, "TestPass123!");

	return {
		companyId: company.id as string,
		userId: user.id as string,
		token,
		email
	};
}

// ============================================================
// Cleanup helpers — call in afterAll
// ============================================================

export async function deleteCompany(companyId: string) {
	if (!companyId) return; // seed failed, nothing to clean up
	const sql = getSql();
	// Delete in dependency order
	await sql`DELETE FROM parts_usage_log          WHERE job_id IN (SELECT id FROM jobs WHERE company_id = ${companyId})`;
	await sql`DELETE FROM invoice_line_items       WHERE invoice_id IN (SELECT id FROM invoices WHERE company_id = ${companyId})`;
	await sql`DELETE FROM estimate_line_items      WHERE estimate_id IN (SELECT id FROM estimates WHERE company_id = ${companyId})`;
	await sql`DELETE FROM invoices                 WHERE company_id = ${companyId}`;
	await sql`DELETE FROM estimates                WHERE company_id = ${companyId}`;
	await sql`DELETE FROM pricebook_items          WHERE company_id = ${companyId}`;
	await sql`DELETE FROM truck_inventory          WHERE company_id = ${companyId}`;
	await sql`DELETE FROM parts_inventory          WHERE company_id = ${companyId}`;
	await sql`DELETE FROM equipment                WHERE company_id = ${companyId}`;
	await sql`DELETE FROM customer_locations       WHERE company_id = ${companyId}`;
	await sql`DELETE FROM customer_communications  WHERE company_id = ${companyId}`;
	await sql`DELETE FROM customer_no_shows        WHERE company_id = ${companyId}`;
	await sql`DELETE FROM customers                WHERE company_id = ${companyId}`;
	await sql`DELETE FROM jobs                     WHERE company_id = ${companyId}`;
	await sql`DELETE FROM employees                WHERE company_id = ${companyId}`;
	await sql`DELETE FROM branches                 WHERE company_id = ${companyId}`;
	await sql`DELETE FROM users                    WHERE company_id = ${companyId}`;
	await sql`DELETE FROM companies                WHERE id = ${companyId}`;
	await sql`DELETE FROM api_rate_limits 		   WHERE key LIKE 'login:%'`;
}
