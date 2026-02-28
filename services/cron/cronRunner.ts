// services/cron/cronRunner.ts
// Core cron logic — called by /api/cron/run (protected with CRON_SECRET).
// Handles:
//   1. Recurring job creation (advance scheduling)
//   2. Membership expiration checks + renewal reminders
//   3. Auto-billing triggers for renewals
//   4. Review request dispatch (post-job)
//   5. Tech certification expiration alerts (Week 4)

import { getSql } from "@/db/connection";

// ─────────────────────────────────────────────────────────────────────────────
// Frequency → days helper
// ─────────────────────────────────────────────────────────────────────────────

const FREQUENCY_DAYS: Record<string, number> = {
	weekly: 7,
	biweekly: 14,
	monthly: 30,
	bimonthly: 60,
	quarterly: 90,
	semiannual: 180,
	annual: 365
};

function addDays(dateStr: string, days: number): string {
	const d = new Date(dateStr);
	d.setDate(d.getDate() + days);
	return d.toISOString().split("T")[0];
}

function today(): string {
	return new Date().toISOString().split("T")[0];
}

function daysFromNow(days: number): string {
	return addDays(today(), days);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. RECURRING JOB CREATION
//    Finds schedules where next_run_at <= today + advance_days
//    and creates a job for each, then advances next_run_at.
// ─────────────────────────────────────────────────────────────────────────────

export async function processRecurringSchedules(): Promise<{
	processed: number;
	created: number;
	errors: number;
}> {
	const sql = getSql();
	let created = 0;
	let errors = 0;

	const schedules = (await sql`
		SELECT
			r.*,
			c.address, c.city, c.state, c.zip,
			c.first_name || ' ' || c.last_name AS customer_name,
			c.phone AS customer_phone,
			c.company_id
		FROM recurring_job_schedules r
		JOIN customers c ON c.id = r.customer_id
		WHERE r.is_active = TRUE
		  AND r.next_run_at <= NOW() + (r.advance_days || ' days')::interval
		ORDER BY r.next_run_at ASC
	`) as any[];

	for (const schedule of schedules) {
		try {
			const [job] = (await sql`
				INSERT INTO jobs (
					company_id, branch_id, customer_id,
					title, description, job_type,
					address, city, state, zip,
					status, priority,
					assigned_tech_id,
					duration_minutes,
					scheduled_at,
					source,
					recurring_schedule_id
				) VALUES (
					${schedule.company_id},
					${schedule.branch_id ?? null},
					${schedule.customer_id},
					${schedule.title},
					${schedule.description ?? null},
					${schedule.job_type},
					${schedule.address},
					${schedule.city ?? null},
					${schedule.state ?? null},
					${schedule.zip ?? null},
					'unassigned',
					'normal',
					${schedule.preferred_tech_id ?? null},
					${schedule.duration_minutes},
					${schedule.next_run_at},
					'recurring',
					${schedule.id}
				)
				RETURNING id
			`) as any[];

			const freq = schedule.frequency as string;
			const days = FREQUENCY_DAYS[freq] ?? 30;
			const nextRun = addDays(schedule.next_run_at, days);

			await sql`
				UPDATE recurring_job_schedules SET
					last_run_at = ${schedule.next_run_at},
					last_job_id = ${job.id},
					next_run_at = ${nextRun},
					updated_at = NOW()
				WHERE id = ${schedule.id}
			`;

			created++;
		} catch (err) {
			console.error(
				`[cron] Failed to create job for schedule ${schedule.id}:`,
				err
			);
			errors++;
		}
	}

	return { processed: schedules.length, created, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. MEMBERSHIP EXPIRATION: send renewal reminders 30 days before expiry
// ─────────────────────────────────────────────────────────────────────────────

export async function processMembershipRenewals(): Promise<{
	reminded: number;
	expired: number;
	renewed: number;
}> {
	const sql = getSql();
	let reminded = 0;
	let expired = 0;
	let renewed = 0;

	const thirtyDaysOut = daysFromNow(30);

	const expiringSoon = (await sql`
		SELECT a.*, t.name AS tier_name, c.email, c.phone,
		       c.first_name || ' ' || c.last_name AS customer_name
		FROM maintenance_agreements a
		JOIN maintenance_agreement_tiers t ON t.id = a.tier_id
		JOIN customers c ON c.id = a.customer_id
		WHERE a.status = 'active'
		  AND a.expires_at <= ${thirtyDaysOut}
		  AND a.renewal_notified_at IS NULL
	`) as any[];

	for (const agreement of expiringSoon) {
		console.log(
			`[cron] Renewal reminder: ${agreement.customer_name} — ${agreement.tier_name} expires ${agreement.expires_at}`
		);
		await sql`
			UPDATE maintenance_agreements SET
				renewal_notified_at = NOW(),
				updated_at = NOW()
			WHERE id = ${agreement.id}
		`;
		reminded++;
	}

	const expiredAgreements = (await sql`
		UPDATE maintenance_agreements SET
			status = 'expired',
			updated_at = NOW()
		WHERE status = 'active'
		  AND expires_at < ${today()}
		RETURNING id, company_id, customer_id, tier_id, billing_cycle, price_locked, auto_renew
	`) as any[];

	expired = expiredAgreements.length;

	for (const a of expiredAgreements) {
		if (!a.auto_renew) continue;
		try {
			const newStart = today();
			const newExpiry = daysFromNow(365);

			const [renewed_agreement] = (await sql`
				INSERT INTO maintenance_agreements (
					company_id, customer_id, tier_id, billing_cycle,
					price_locked, starts_at, expires_at, auto_renew,
					visits_allowed, visits_used
				)
				SELECT
					company_id, customer_id, tier_id, billing_cycle,
					price_locked, ${newStart}, ${newExpiry}, TRUE,
					visits_allowed, 0
				FROM maintenance_agreements WHERE id = ${a.id}
				RETURNING id
			`) as any[];

			await sql`
				INSERT INTO billing_trigger_log (
					company_id, agreement_id, trigger_type, status
				) VALUES (
					${a.company_id}, ${renewed_agreement.id}, 'agreement_renewal', 'pending'
				)
			`;

			renewed++;
		} catch (err) {
			console.error(`[cron] Auto-renew failed for agreement ${a.id}:`, err);
		}
	}

	return { reminded, expired, renewed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-BILLING: process pending billing triggers
// ─────────────────────────────────────────────────────────────────────────────

export async function processBillingTriggers(): Promise<{
	processed: number;
	invoiced: number;
	failed: number;
}> {
	const sql = getSql();
	let invoiced = 0;
	let failed = 0;

	const pending = (await sql`
		SELECT b.*, a.customer_id, a.price_locked, a.billing_cycle, a.company_id
		FROM billing_trigger_log b
		JOIN maintenance_agreements a ON a.id = b.agreement_id
		WHERE b.status = 'pending'
		  AND b.trigger_type = 'agreement_renewal'
		ORDER BY b.triggered_at ASC
		LIMIT 50
	`) as any[];

	for (const trigger of pending) {
		try {
			const year = new Date().getFullYear();
			const seqResult =
				(await sql`SELECT nextval('invoice_number_seq') AS seq`) as any[];
			const invoiceNumber = `INV-${year}-${String(seqResult[0].seq).padStart(5, "0")}`;

			const [invoice] = (await sql`
				INSERT INTO invoices (
					company_id, customer_id, agreement_id,
					invoice_number, status,
					subtotal, tax_rate, tax_amount, total,
					due_date, auto_generated
				) VALUES (
					${trigger.company_id},
					${trigger.customer_id},
					${trigger.agreement_id},
					${invoiceNumber},
					'sent',
					${trigger.price_locked},
					0,
					0,
					${trigger.price_locked},
					${daysFromNow(30)},
					TRUE
				)
				RETURNING id
			`) as any[];

			await sql`
				INSERT INTO invoice_line_items (
					invoice_id, item_type, name, quantity, unit_price, taxable, sort_order
				) VALUES (
					${invoice.id},
					'custom',
					${"Maintenance Agreement Renewal — " + trigger.billing_cycle},
					1,
					${trigger.price_locked},
					FALSE,
					0
				)
			`;

			await sql`
				UPDATE billing_trigger_log SET
					status = 'success',
					invoice_id = ${invoice.id},
					processed_at = NOW()
				WHERE id = ${trigger.id}
			`;

			invoiced++;
		} catch (err) {
			console.error(`[cron] Billing trigger failed ${trigger.id}:`, err);
			await sql`
				UPDATE billing_trigger_log SET
					status = 'failed',
					error_message = ${String(err)},
					processed_at = NOW()
				WHERE id = ${trigger.id}
			`;
			failed++;
		}
	}

	return { processed: pending.length, invoiced, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. REVIEW REQUEST SCHEDULING
//    Schedule review requests 2 hours after job completion.
// ─────────────────────────────────────────────────────────────────────────────

export async function scheduleReviewRequests(): Promise<{ scheduled: number }> {
	const sql = getSql();

	const completedJobs = (await sql`
		SELECT j.id, j.company_id, j.customer_id, j.completed_at,
		       c.phone, c.email
		FROM jobs j
		JOIN customers c ON c.id = j.customer_id
		WHERE j.status = 'completed'
		  AND j.completed_at > NOW() - INTERVAL '24 hours'
		  AND NOT EXISTS (
		      SELECT 1 FROM review_requests r WHERE r.job_id = j.id
		  )
		  AND (c.phone IS NOT NULL OR c.email IS NOT NULL)
	`) as any[];

	for (const job of completedJobs) {
		const channel = job.phone ? "sms" : "email";
		const scheduledFor = new Date(job.completed_at);
		scheduledFor.setHours(scheduledFor.getHours() + 2);

		await sql`
			INSERT INTO review_requests (
				company_id, job_id, customer_id, channel, scheduled_for, review_platform
			) VALUES (
				${job.company_id}, ${job.id}, ${job.customer_id},
				${channel}, ${scheduledFor.toISOString()}, 'google'
			)
		`;
	}

	return { scheduled: completedJobs.length };
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. REVIEW REQUEST DISPATCH
// ─────────────────────────────────────────────────────────────────────────────

export async function dispatchPendingReviewRequests(): Promise<{
	sent: number;
	failed: number;
}> {
	const sql = getSql();
	let sent = 0;
	let failed = 0;

	const due = (await sql`
		SELECT r.*, c.phone, c.email, c.first_name,
		       comp.name AS company_name
		FROM review_requests r
		JOIN customers c ON c.id = r.customer_id
		JOIN companies comp ON comp.id = r.company_id
		WHERE r.status = 'pending'
		  AND r.scheduled_for <= NOW()
		ORDER BY r.scheduled_for ASC
		LIMIT 100
	`) as any[];

	for (const req of due) {
		try {
			// TODO: Integrate Twilio / SendGrid here
			console.log(
				`[review] Sending ${req.channel} review request to customer ${req.customer_id} for job ${req.job_id}`
			);

			await sql`
				UPDATE review_requests SET
					status = 'sent',
					sent_at = NOW(),
					updated_at = NOW()
				WHERE id = ${req.id}
			`;
			sent++;
		} catch (err) {
			console.error(`[review] Failed to send request ${req.id}:`, err);
			await sql`
				UPDATE review_requests SET status = 'failed', updated_at = NOW()
				WHERE id = ${req.id}
			`;
			failed++;
		}
	}

	return { sent, failed };
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. CERT EXPIRATION ALERTS (Week 4)
//    Fires at 90 / 30 / 7 days before expiry, and on day of expiry.
//    Each threshold flag is flipped once — never re-fires.
// ─────────────────────────────────────────────────────────────────────────────

export async function processCertExpirationAlerts(): Promise<{
	alerts_fired: number;
	errors: number;
}> {
	const sql = getSql();
	let alerts_fired = 0;
	let errors = 0;

	const certs = (await sql`
		SELECT
			tc.id,
			tc.tech_id,
			tc.company_id,
			tc.cert_type,
			tc.cert_number,
			tc.expiry_date,
			tc.alert_sent_90d,
			tc.alert_sent_30d,
			tc.alert_sent_7d,
			tc.alert_sent_expired,
			e.name  AS tech_name,
			e.email AS tech_email
		FROM tech_certifications tc
		JOIN employees e ON e.id = tc.tech_id
		WHERE tc.is_active = TRUE
		  AND tc.expiry_date IS NOT NULL
		  AND (
		      tc.alert_sent_90d     = FALSE
		   OR tc.alert_sent_30d     = FALSE
		   OR tc.alert_sent_7d      = FALSE
		   OR tc.alert_sent_expired = FALSE
		  )
		ORDER BY tc.expiry_date ASC
	`) as {
		id: string;
		tech_id: string;
		company_id: string;
		cert_type: string;
		cert_number: string | null;
		expiry_date: string;
		alert_sent_90d: boolean;
		alert_sent_30d: boolean;
		alert_sent_7d: boolean;
		alert_sent_expired: boolean;
		tech_name: string;
		tech_email: string;
	}[];

	const todayMs = Date.now();

	for (const cert of certs) {
		try {
			const expiryMs = new Date(cert.expiry_date).getTime();
			const daysUntilExpiry = Math.ceil(
				(expiryMs - todayMs) / (1000 * 60 * 60 * 24)
			);

			type AlertFlag =
				| "alert_sent_90d"
				| "alert_sent_30d"
				| "alert_sent_7d"
				| "alert_sent_expired";

			const toFire: {
				flag: AlertFlag;
				severity: "info" | "warning" | "critical";
				label: string;
			}[] = [];

			if (!cert.alert_sent_90d && daysUntilExpiry <= 90 && daysUntilExpiry > 30) {
				toFire.push({ flag: "alert_sent_90d", severity: "info", label: "90 days" });
			}
			if (!cert.alert_sent_30d && daysUntilExpiry <= 30 && daysUntilExpiry > 7) {
				toFire.push({ flag: "alert_sent_30d", severity: "warning", label: "30 days" });
			}
			if (!cert.alert_sent_7d && daysUntilExpiry <= 7 && daysUntilExpiry > 0) {
				toFire.push({ flag: "alert_sent_7d", severity: "critical", label: "7 days" });
			}
			if (!cert.alert_sent_expired && daysUntilExpiry <= 0) {
				toFire.push({ flag: "alert_sent_expired", severity: "critical", label: "EXPIRED" });
			}

			for (const alert of toFire) {
				const title = `${cert.cert_type} expiring in ${alert.label}`;
				const message =
					daysUntilExpiry <= 0
						? `${cert.tech_name}'s ${cert.cert_type}${cert.cert_number ? ` (${cert.cert_number})` : ""} expired on ${cert.expiry_date}. Renew immediately — tech may not legally perform work requiring this cert.`
						: `${cert.tech_name}'s ${cert.cert_type}${cert.cert_number ? ` (${cert.cert_number})` : ""} expires on ${cert.expiry_date}. ${daysUntilExpiry} days remaining.`;

				await sql`
					INSERT INTO kpi_alerts (
						company_id, alert_type, severity,
						title, message,
						entity_type, entity_id,
						is_read, is_resolved,
						created_at
					) VALUES (
						${cert.company_id}, 'cert_expiration', ${alert.severity},
						${title}, ${message},
						'employee', ${cert.tech_id},
						FALSE, FALSE,
						NOW()
					)
				`;

				// Flip the specific flag — use a switch to avoid dynamic identifier issues
				switch (alert.flag) {
					case "alert_sent_90d":
						await sql`UPDATE tech_certifications SET alert_sent_90d = TRUE, updated_at = NOW() WHERE id = ${cert.id}`;
						break;
					case "alert_sent_30d":
						await sql`UPDATE tech_certifications SET alert_sent_30d = TRUE, updated_at = NOW() WHERE id = ${cert.id}`;
						break;
					case "alert_sent_7d":
						await sql`UPDATE tech_certifications SET alert_sent_7d = TRUE, updated_at = NOW() WHERE id = ${cert.id}`;
						break;
					case "alert_sent_expired":
						await sql`UPDATE tech_certifications SET alert_sent_expired = TRUE, updated_at = NOW() WHERE id = ${cert.id}`;
						break;
				}

				console.log(
					`[cron] cert alert fired: ${cert.tech_name} — ${cert.cert_type} — ${alert.label}`
				);
				alerts_fired++;
			}
		} catch (err) {
			console.error(`[cron] cert alert failed for cert ${cert.id}:`, err);
			errors++;
		}
	}

	return { alerts_fired, errors };
}

// ─────────────────────────────────────────────────────────────────────────────
// MASTER RUNNER — called by /api/cron/run
// ─────────────────────────────────────────────────────────────────────────────

export async function runAllCronJobs() {
	const results: Record<string, any> = {};

	console.log("[cron] Starting cron run...");

	results.recurringJobs = await processRecurringSchedules();
	console.log("[cron] Recurring jobs:", results.recurringJobs);

	results.membershipRenewals = await processMembershipRenewals();
	console.log("[cron] Membership renewals:", results.membershipRenewals);

	results.billingTriggers = await processBillingTriggers();
	console.log("[cron] Billing triggers:", results.billingTriggers);

	results.reviewRequests = await scheduleReviewRequests();
	console.log("[cron] Review request scheduling:", results.reviewRequests);

	results.reviewDispatch = await dispatchPendingReviewRequests();
	console.log("[cron] Review dispatch:", results.reviewDispatch);

	results.certAlerts = await processCertExpirationAlerts();
	console.log("[cron] Cert alerts:", results.certAlerts);

	console.log("[cron] Run complete.");
	return results;
}