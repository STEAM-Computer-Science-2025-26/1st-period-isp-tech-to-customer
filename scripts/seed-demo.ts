// scripts/seed-demo.ts
//
// Seeds a "Demo HVAC Solutions" company with realistic fake employees,
// customers, and jobs whose scheduled times are always relative to TODAY.
// Run with: pnpm seed:demo
// Re-running is safe — existing demo data is deleted and re-created.
// Pass --reset to force a fresh seed even if the company already exists.

import dotenv from "dotenv";
import path from "node:path";

// Load env before importing db
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

import bcrypt from "bcryptjs";
import { getSql } from "../db/connection";

const DEMO_COMPANY_NAME = "Demo HVAC Solutions";
const DEMO_ADMIN_EMAIL = "demo@demohvac.com";
const DEMO_ADMIN_PASSWORD = "Demo1234!";

// ─── Employee seed data ───────────────────────────────────────────────────────

const EMPLOYEES = [
	{
		name: "Marcus Johnson",
		email: "marcus.johnson@demohvac.com",
		phone: "214-555-0101",
		skills: ["hvac_repair", "hvac_maintenance"],
		skillLevel: { hvac_repair: 3, hvac_maintenance: 2 },
		homeAddress: "2301 Forest Ave, Dallas, TX 75201",
		latitude: 32.76,
		longitude: -96.81,
		rating: 4.8,
		maxConcurrentJobs: 2
	},
	{
		name: "Sarah Chen",
		email: "sarah.chen@demohvac.com",
		phone: "972-555-0102",
		skills: ["hvac_install", "hvac_repair"],
		skillLevel: { hvac_install: 2, hvac_repair: 2 },
		homeAddress: "501 Willow Rd, Plano, TX 75025",
		latitude: 33.03,
		longitude: -96.72,
		rating: 4.6,
		maxConcurrentJobs: 1
	},
	{
		name: "Derek Williams",
		email: "derek.williams@demohvac.com",
		phone: "972-555-0103",
		skills: ["hvac_maintenance", "ductwork"],
		skillLevel: { hvac_maintenance: 3, ductwork: 2 },
		homeAddress: "1122 Summit Blvd, Irving, TX 75062",
		latitude: 32.82,
		longitude: -96.97,
		rating: 4.5,
		maxConcurrentJobs: 2
	},
	{
		name: "Ashley Rivera",
		email: "ashley.rivera@demohvac.com",
		phone: "469-555-0104",
		skills: ["hvac_install", "electrical"],
		skillLevel: { hvac_install: 2, electrical: 1 },
		homeAddress: "3344 Hilltop Dr, Garland, TX 75041",
		latitude: 32.92,
		longitude: -96.66,
		rating: 4.3,
		maxConcurrentJobs: 1
	},
	{
		name: "Carlos Mendez",
		email: "carlos.mendez@demohvac.com",
		phone: "214-555-0105",
		skills: ["hvac_repair", "refrigeration"],
		skillLevel: { hvac_repair: 3, refrigeration: 2 },
		homeAddress: "775 Canyon Rd, Mesquite, TX 75150",
		latitude: 32.77,
		longitude: -96.6,
		rating: 4.9,
		maxConcurrentJobs: 2
	}
];

// ─── Customer seed data ───────────────────────────────────────────────────────

const CUSTOMERS = [
	{
		firstName: "John",
		lastName: "Harrington",
		phone: "214-555-1001",
		email: "j.harrington@example.com",
		address: "1204 Maple St",
		city: "Dallas",
		state: "TX",
		zip: "75201",
		latitude: 32.7826,
		longitude: -96.7908,
		customerType: "residential" as const
	},
	{
		firstName: "Robert",
		lastName: "Chen",
		phone: "972-555-1002",
		email: "r.chen@example.com",
		address: "847 Oak Drive",
		city: "Plano",
		state: "TX",
		zip: "75024",
		latitude: 33.0198,
		longitude: -96.7100,
		customerType: "residential" as const
	},
	{
		firstName: "Linda",
		lastName: "Patterson",
		phone: "972-555-1003",
		email: "l.patterson@example.com",
		address: "3301 Elm Ave",
		city: "Irving",
		state: "TX",
		zip: "75061",
		latitude: 32.814,
		longitude: -96.96,
		customerType: "residential" as const
	},
	{
		firstName: "Michael",
		lastName: "Torres",
		phone: "972-555-1004",
		email: "m.torres@example.com",
		address: "512 Cedar Blvd",
		city: "Garland",
		state: "TX",
		zip: "75040",
		latitude: 32.9126,
		longitude: -96.65,
		customerType: "residential" as const
	},
	{
		firstName: "Susan",
		lastName: "Martinez",
		phone: "817-555-1005",
		email: "s.martinez@example.com",
		address: "2908 Pine St",
		city: "Arlington",
		state: "TX",
		zip: "76010",
		latitude: 32.7357,
		longitude: -97.12,
		customerType: "residential" as const
	},
	{
		firstName: "David",
		lastName: "Kim",
		phone: "972-555-1006",
		email: "d.kim@example.com",
		address: "1755 Birch Lane",
		city: "Richardson",
		state: "TX",
		zip: "75080",
		latitude: 32.9483,
		longitude: -96.74,
		customerType: "residential" as const
	},
	{
		firstName: "Jennifer",
		lastName: "Walsh",
		phone: "972-555-1007",
		email: "j.walsh@example.com",
		address: "690 Walnut Ct",
		city: "Mesquite",
		state: "TX",
		zip: "75149",
		latitude: 32.7668,
		longitude: -96.61,
		customerType: "residential" as const
	},
	{
		firstName: "Thomas",
		lastName: "Wright",
		phone: "972-555-1008",
		email: "t.wright@example.com",
		address: "4422 Spruce Dr",
		city: "Frisco",
		state: "TX",
		zip: "75034",
		latitude: 33.1507,
		longitude: -96.84,
		customerType: "residential" as const
	}
];

// ─── Job templates ─────────────────────────────────────────────────────────────
// daysOffset: negative = past, 0 = today, positive = future
// hourOfDay: 24h local hour for scheduled time

type JobTemplate = {
	customerIndex: number; // index into CUSTOMERS
	techIndex: number | null; // index into EMPLOYEES, null = unassigned
	jobType: "installation" | "repair" | "maintenance" | "inspection";
	status: "unassigned" | "assigned" | "in_progress" | "completed" | "cancelled";
	priority: "low" | "medium" | "high" | "emergency";
	daysOffset: number;
	hourOfDay: number;
	initialNotes: string;
	requiredSkills: string[];
};

const JOB_TEMPLATES: JobTemplate[] = [
	// ── Past / completed ────────────────────────────────────────────────────
	{
		customerIndex: 0,
		techIndex: 0,
		jobType: "maintenance",
		status: "completed",
		priority: "medium",
		daysOffset: -6,
		hourOfDay: 9,
		initialNotes: "Annual HVAC tune-up. Filter replacement needed.",
		requiredSkills: ["hvac_maintenance"]
	},
	{
		customerIndex: 2,
		techIndex: 1,
		jobType: "repair",
		status: "completed",
		priority: "high",
		daysOffset: -5,
		hourOfDay: 10,
		initialNotes: "Unit not cooling. Possible refrigerant leak.",
		requiredSkills: ["hvac_repair"]
	},
	{
		customerIndex: 4,
		techIndex: 4,
		jobType: "repair",
		status: "completed",
		priority: "high",
		daysOffset: -4,
		hourOfDay: 8,
		initialNotes: "AC blowing warm air. Compressor issue suspected.",
		requiredSkills: ["hvac_repair", "refrigeration"]
	},
	{
		customerIndex: 6,
		techIndex: 2,
		jobType: "installation",
		status: "completed",
		priority: "medium",
		daysOffset: -3,
		hourOfDay: 9,
		initialNotes: "Install new Carrier 3-ton split system.",
		requiredSkills: ["hvac_install"]
	},
	{
		customerIndex: 5,
		techIndex: 3,
		jobType: "inspection",
		status: "completed",
		priority: "low",
		daysOffset: -2,
		hourOfDay: 13,
		initialNotes: "Pre-summer inspection. Check all components.",
		requiredSkills: ["hvac_maintenance"]
	},

	// ── Today ────────────────────────────────────────────────────────────────
	{
		customerIndex: 1,
		techIndex: 0,
		jobType: "repair",
		status: "in_progress",
		priority: "high",
		daysOffset: 0,
		hourOfDay: 8,
		initialNotes: "Capacitor failure on condenser unit. Customer reports no cooling since yesterday.",
		requiredSkills: ["hvac_repair"]
	},
	{
		customerIndex: 3,
		techIndex: 4,
		jobType: "maintenance",
		status: "assigned",
		priority: "medium",
		daysOffset: 0,
		hourOfDay: 14,
		initialNotes: "Quarterly maintenance visit. Clean coils and check refrigerant levels.",
		requiredSkills: ["hvac_maintenance", "refrigeration"]
	},
	{
		customerIndex: 7,
		techIndex: null,
		jobType: "repair",
		status: "unassigned",
		priority: "emergency",
		daysOffset: 0,
		hourOfDay: 10,
		initialNotes:
			"EMERGENCY: Complete system failure. Customer has infant at home. No AC in 95°F heat.",
		requiredSkills: ["hvac_repair"]
	},

	// ── Tomorrow (+1) ─────────────────────────────────────────────────────────
	{
		customerIndex: 0,
		techIndex: 1,
		jobType: "installation",
		status: "assigned",
		priority: "medium",
		daysOffset: 1,
		hourOfDay: 9,
		initialNotes: "Install new Trane 4-ton heat pump. Old unit being replaced.",
		requiredSkills: ["hvac_install"]
	},
	{
		customerIndex: 4,
		techIndex: null,
		jobType: "maintenance",
		status: "unassigned",
		priority: "low",
		daysOffset: 1,
		hourOfDay: 11,
		initialNotes: "Pre-summer tune-up. Replace filters and check all electrical connections.",
		requiredSkills: ["hvac_maintenance"]
	},
	{
		customerIndex: 6,
		techIndex: 0,
		jobType: "repair",
		status: "assigned",
		priority: "high",
		daysOffset: 1,
		hourOfDay: 13,
		initialNotes: "Thermostat replaced 2 weeks ago but unit still short cycling. Needs diagnosis.",
		requiredSkills: ["hvac_repair"]
	},

	// ── Day after tomorrow (+2) ───────────────────────────────────────────────
	{
		customerIndex: 1,
		techIndex: null,
		jobType: "installation",
		status: "unassigned",
		priority: "medium",
		daysOffset: 2,
		hourOfDay: 9,
		initialNotes: "Install mini-split in home office addition. 1.5 ton unit.",
		requiredSkills: ["hvac_install", "electrical"]
	},
	{
		customerIndex: 2,
		techIndex: 3,
		jobType: "maintenance",
		status: "assigned",
		priority: "low",
		daysOffset: 2,
		hourOfDay: 14,
		initialNotes: "Routine maintenance. Check ductwork for leaks while there.",
		requiredSkills: ["hvac_maintenance", "ductwork"]
	},

	// ── +3 to +7 days ─────────────────────────────────────────────────────────
	{
		customerIndex: 3,
		techIndex: null,
		jobType: "repair",
		status: "unassigned",
		priority: "medium",
		daysOffset: 3,
		hourOfDay: 9,
		initialNotes: "Noise coming from air handler. Possible blower motor issue.",
		requiredSkills: ["hvac_repair"]
	},
	{
		customerIndex: 5,
		techIndex: null,
		jobType: "inspection",
		status: "unassigned",
		priority: "low",
		daysOffset: 4,
		hourOfDay: 11,
		initialNotes: "Pre-sale home inspection of HVAC system. Buyer's request.",
		requiredSkills: ["hvac_maintenance"]
	},
	{
		customerIndex: 7,
		techIndex: 2,
		jobType: "installation",
		status: "assigned",
		priority: "medium",
		daysOffset: 5,
		hourOfDay: 10,
		initialNotes: "Full system replacement. Lennox XC21 install with new air handler.",
		requiredSkills: ["hvac_install", "ductwork"]
	},
	{
		customerIndex: 6,
		techIndex: null,
		jobType: "maintenance",
		status: "unassigned",
		priority: "low",
		daysOffset: 6,
		hourOfDay: 13,
		initialNotes: "Semi-annual maintenance. Customer on maintenance plan.",
		requiredSkills: ["hvac_maintenance"]
	},
	{
		customerIndex: 1,
		techIndex: null,
		jobType: "repair",
		status: "unassigned",
		priority: "medium",
		daysOffset: 7,
		hourOfDay: 9,
		initialNotes: "Commercial rooftop unit losing efficiency. Potential coil cleaning needed.",
		requiredSkills: ["hvac_repair", "refrigeration"]
	}
];

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	const sql = getSql();
	const args = process.argv.slice(2);
	const forceReset = args.includes("--reset");

	console.log("🔍 Checking for existing demo company...");

	const existing =
		await sql`SELECT id FROM companies WHERE name = ${DEMO_COMPANY_NAME}`;

	if (existing.length > 0 && !forceReset) {
		console.log(
			`✅ Demo company already exists (id: ${existing[0].id}). Pass --reset to re-seed.`
		);
		process.exit(0);
	}

	if (existing.length > 0 && forceReset) {
		console.log("🗑️  Deleting existing demo data...");
		await sql`DELETE FROM companies WHERE name = ${DEMO_COMPANY_NAME}`;
		// Cascade deletes will clean up employees, jobs, customers, users
		console.log("   ✓ Deleted");
	}

	// ── Create company ────────────────────────────────────────────────────────
	console.log("🏢 Creating demo company...");
	const [company] = await sql`
		INSERT INTO companies (name)
		VALUES (${DEMO_COMPANY_NAME})
		RETURNING id
	`;
	const companyId = company.id as string;
	console.log(`   ✓ Company: ${DEMO_COMPANY_NAME} (${companyId})`);

	// ── Create admin user ──────────────────────────────────────────────────────
	console.log("👤 Creating demo admin user...");
	const passwordHash = await bcrypt.hash(DEMO_ADMIN_PASSWORD, 10);
	const [adminUser] = await sql`
		INSERT INTO users (email, password_hash, role, company_id)
		VALUES (${DEMO_ADMIN_EMAIL}, ${passwordHash}, 'admin', ${companyId})
		RETURNING id
	`;
	console.log(
		`   ✓ User: ${DEMO_ADMIN_EMAIL} / ${DEMO_ADMIN_PASSWORD} (id: ${adminUser.id})`
	);

	// ── Create customers ──────────────────────────────────────────────────────
	console.log("👥 Creating demo customers...");
	const customerIds: string[] = [];
	for (const c of CUSTOMERS) {
		const [row] = await sql`
			INSERT INTO customers (
				company_id, first_name, last_name, customer_type,
				email, phone, address, city, state, zip,
				latitude, longitude, geocoding_status
			) VALUES (
				${companyId}, ${c.firstName}, ${c.lastName}, ${c.customerType},
				${c.email}, ${c.phone}, ${c.address}, ${c.city}, ${c.state}, ${c.zip},
				${c.latitude}, ${c.longitude}, 'complete'
			)
			RETURNING id
		`;
		customerIds.push(row.id as string);
		console.log(`   ✓ Customer: ${c.firstName} ${c.lastName} — ${c.address}, ${c.city}`);
	}

	// ── Create employees ──────────────────────────────────────────────────────
	console.log("🔧 Creating demo employees...");
	const employeeIds: string[] = [];
	for (const e of EMPLOYEES) {
		// skills is a text[] column — must use PostgreSQL array literal syntax
		const skillsArray = `{${e.skills.join(",")}}`;
		const [row] = await sql`
			INSERT INTO employees (
				company_id, name, email, phone,
				skills, skill_level, home_address,
				latitude, longitude,
				is_available, rating,
				max_concurrent_jobs
			) VALUES (
				${companyId}, ${e.name}, ${e.email}, ${e.phone},
				${skillsArray}, ${JSON.stringify(e.skillLevel)},
				${e.homeAddress}, ${e.latitude}, ${e.longitude},
				true, ${e.rating},
				${e.maxConcurrentJobs}
			)
			RETURNING id
		`;
		employeeIds.push(row.id as string);
		console.log(`   ✓ Employee: ${e.name} — ${e.skills.join(", ")}`);
	}

	// ── Create jobs ───────────────────────────────────────────────────────────
	console.log("📋 Creating demo jobs...");
	for (const j of JOB_TEMPLATES) {
		const customer = CUSTOMERS[j.customerIndex];
		const techId =
			j.techIndex !== null ? employeeIds[j.techIndex] : null;
		const customerId = customerIds[j.customerIndex];

		// Compute scheduled time in JS so we can pass it as a normal param
		const scheduled = new Date();
		scheduled.setDate(scheduled.getDate() + j.daysOffset);
		scheduled.setHours(j.hourOfDay, 0, 0, 0);
		scheduled.setMilliseconds(0);

		const completedAt =
			j.status === "completed"
				? new Date(scheduled.getTime() + 2 * 60 * 60 * 1000) // +2 hours
				: null;

		const fullAddress = `${customer.address}, ${customer.city}, ${customer.state} ${customer.zip}`;
		const customerName = `${customer.firstName} ${customer.lastName}`;
		// required_skills is a text[] column — must use PostgreSQL array literal syntax
		const reqSkills = `{${j.requiredSkills.join(",")}}`;

		if (techId && completedAt) {
			await sql`
				INSERT INTO jobs (
					company_id, customer_id, customer_name, address,
					phone, job_type, status, priority,
					assigned_tech_id, scheduled_time, completed_at,
					initial_notes, required_skills,
					latitude, longitude, geocoding_status
				) VALUES (
					${companyId}, ${customerId}, ${customerName}, ${fullAddress},
					${customer.phone}, ${j.jobType}, ${j.status}, ${j.priority},
					${techId}, ${scheduled.toISOString()}, ${completedAt.toISOString()},
					${j.initialNotes}, ${reqSkills},
					${customer.latitude}, ${customer.longitude}, 'complete'
				)
			`;
		} else if (techId) {
			await sql`
				INSERT INTO jobs (
					company_id, customer_id, customer_name, address,
					phone, job_type, status, priority,
					assigned_tech_id, scheduled_time,
					initial_notes, required_skills,
					latitude, longitude, geocoding_status
				) VALUES (
					${companyId}, ${customerId}, ${customerName}, ${fullAddress},
					${customer.phone}, ${j.jobType}, ${j.status}, ${j.priority},
					${techId}, ${scheduled.toISOString()},
					${j.initialNotes}, ${reqSkills},
					${customer.latitude}, ${customer.longitude}, 'complete'
				)
			`;
		} else {
			await sql`
				INSERT INTO jobs (
					company_id, customer_id, customer_name, address,
					phone, job_type, status, priority,
					scheduled_time, initial_notes, required_skills,
					latitude, longitude, geocoding_status
				) VALUES (
					${companyId}, ${customerId}, ${customerName}, ${fullAddress},
					${customer.phone}, ${j.jobType}, ${j.status}, ${j.priority},
					${scheduled.toISOString()},
					${j.initialNotes}, ${reqSkills},
					${customer.latitude}, ${customer.longitude}, 'complete'
				)
			`;
		}

		const techName =
			j.techIndex !== null ? EMPLOYEES[j.techIndex].name : "unassigned";
		const dayLabel =
			j.daysOffset === 0
				? "today"
				: j.daysOffset > 0
					? `+${j.daysOffset}d`
					: `${j.daysOffset}d`;
		console.log(
			`   ✓ Job [${dayLabel} ${j.hourOfDay}:00] ${j.jobType} @ ${customer.lastName} — ${j.status} (${techName})`
		);
	}

	console.log("");
	console.log("✅ Demo seed complete!");
	console.log(`   Company:  ${DEMO_COMPANY_NAME}`);
	console.log(`   Login:    ${DEMO_ADMIN_EMAIL}`);
	console.log(`   Password: ${DEMO_ADMIN_PASSWORD}`);
	console.log(`   Employees: ${EMPLOYEES.length}`);
	console.log(`   Customers: ${CUSTOMERS.length}`);
	console.log(`   Jobs:      ${JOB_TEMPLATES.length}`);
	console.log("");
	console.log("   Re-run with --reset to wipe and re-create demo data.");
}

main().catch((err) => {
	console.error("❌ Seed failed:", err);
	process.exit(1);
});
