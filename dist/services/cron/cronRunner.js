// services/cron/cronRunner.ts
// Core cron logic — called by /api/cron/run (protected with CRON_SECRET).
// Handles:
//   1. Recurring job creation (advance scheduling)
//   2. Membership expiration checks + renewal reminders
//   3. Auto-billing triggers for renewals
//   4. Review request dispatch (post-job)
import { getSql } from "@/db/connection";
// ─────────────────────────────────────────────────────────────────────────────
// Frequency → days helper
// ─────────────────────────────────────────────────────────────────────────────
const FREQUENCY_DAYS = {
    weekly: 7,
    biweekly: 14,
    monthly: 30,
    bimonthly: 60,
    quarterly: 90,
    semiannual: 180,
    annual: 365
};
function addDays(dateStr, days) {
    const d = new Date(dateStr);
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
}
function today() {
    return new Date().toISOString().split("T")[0];
}
function daysFromNow(days) {
    return addDays(today(), days);
}
// ─────────────────────────────────────────────────────────────────────────────
// 1. RECURRING JOB CREATION
//    Finds schedules where next_run_at <= today + advance_days
//    and creates a job for each, then advances next_run_at.
// ─────────────────────────────────────────────────────────────────────────────
export async function processRecurringSchedules() {
    const sql = getSql();
    let created = 0;
    let errors = 0;
    // Find all due schedules
    const schedules = (await sql `
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
	`);
    for (const schedule of schedules) {
        try {
            // Create the job
            const [job] = (await sql `
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
			`);
            // Advance next_run_at
            const freq = schedule.frequency;
            const days = FREQUENCY_DAYS[freq] ?? 30;
            const nextRun = addDays(schedule.next_run_at, days);
            await sql `
				UPDATE recurring_job_schedules SET
					last_run_at = ${schedule.next_run_at},
					last_job_id = ${job.id},
					next_run_at = ${nextRun},
					updated_at = NOW()
				WHERE id = ${schedule.id}
			`;
            created++;
        }
        catch (err) {
            console.error(`[cron] Failed to create job for schedule ${schedule.id}:`, err);
            errors++;
        }
    }
    return { processed: schedules.length, created, errors };
}
// ─────────────────────────────────────────────────────────────────────────────
// 2. MEMBERSHIP EXPIRATION: send renewal reminders 30 days before expiry
// ─────────────────────────────────────────────────────────────────────────────
export async function processMembershipRenewals() {
    const sql = getSql();
    let reminded = 0;
    let expired = 0;
    let renewed = 0;
    const thirtyDaysOut = daysFromNow(30);
    // Agreements expiring within 30 days that haven't been notified yet
    const expiringSoon = (await sql `
		SELECT a.*, t.name AS tier_name, c.email, c.phone,
		       c.first_name || ' ' || c.last_name AS customer_name
		FROM maintenance_agreements a
		JOIN maintenance_agreement_tiers t ON t.id = a.tier_id
		JOIN customers c ON c.id = a.customer_id
		WHERE a.status = 'active'
		  AND a.expires_at <= ${thirtyDaysOut}
		  AND a.renewal_notified_at IS NULL
	`);
    for (const agreement of expiringSoon) {
        // TODO: Integrate SMS/email provider to send actual notification
        // For now, log the notification and mark it sent
        console.log(`[cron] Renewal reminder: ${agreement.customer_name} — ${agreement.tier_name} expires ${agreement.expires_at}`);
        await sql `
			UPDATE maintenance_agreements SET
				renewal_notified_at = NOW(),
				updated_at = NOW()
			WHERE id = ${agreement.id}
		`;
        reminded++;
    }
    // Mark expired agreements
    const expiredAgreements = (await sql `
		UPDATE maintenance_agreements SET
			status = 'expired',
			updated_at = NOW()
		WHERE status = 'active'
		  AND expires_at < ${today()}
		RETURNING id, company_id, customer_id, tier_id, billing_cycle, price_locked, auto_renew
	`);
    expired = expiredAgreements.length;
    // Auto-renew eligible agreements
    for (const a of expiredAgreements) {
        if (!a.auto_renew)
            continue;
        try {
            const newStart = today();
            const newExpiry = daysFromNow(365);
            const [renewed_agreement] = (await sql `
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
			`);
            // Queue a billing trigger for the renewal
            await sql `
				INSERT INTO billing_trigger_log (
					company_id, agreement_id, trigger_type, status
				) VALUES (
					${a.company_id}, ${renewed_agreement.id}, 'agreement_renewal', 'pending'
				)
			`;
            renewed++;
        }
        catch (err) {
            console.error(`[cron] Auto-renew failed for agreement ${a.id}:`, err);
        }
    }
    return { reminded, expired, renewed };
}
// ─────────────────────────────────────────────────────────────────────────────
// 3. AUTO-BILLING: process pending billing triggers
// ─────────────────────────────────────────────────────────────────────────────
export async function processBillingTriggers() {
    const sql = getSql();
    let invoiced = 0;
    let failed = 0;
    const pending = (await sql `
		SELECT b.*, a.customer_id, a.price_locked, a.billing_cycle, a.company_id
		FROM billing_trigger_log b
		JOIN maintenance_agreements a ON a.id = b.agreement_id
		WHERE b.status = 'pending'
		  AND b.trigger_type = 'agreement_renewal'
		ORDER BY b.triggered_at ASC
		LIMIT 50
	`);
    for (const trigger of pending) {
        try {
            // Generate invoice number: INV-YYYY-NNNNN
            const year = new Date().getFullYear();
            const seqResult = (await sql `SELECT nextval('invoice_number_seq') AS seq`);
            const invoiceNumber = `INV-${year}-${String(seqResult[0].seq).padStart(5, "0")}`;
            const [invoice] = (await sql `
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
			`);
            // Insert the single line item into invoice_line_items
            await sql `
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
            await sql `
				UPDATE billing_trigger_log SET
					status = 'success',
					invoice_id = ${invoice.id},
					processed_at = NOW()
				WHERE id = ${trigger.id}
			`;
            invoiced++;
        }
        catch (err) {
            console.error(`[cron] Billing trigger failed ${trigger.id}:`, err);
            await sql `
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
// 4. REVIEW REQUEST DISPATCH
//    Schedule review requests 2 hours after job completion.
//    The actual send happens via SMS/email provider (stub here).
// ─────────────────────────────────────────────────────────────────────────────
export async function scheduleReviewRequests() {
    const sql = getSql();
    // Find completed jobs in last 24h that don't have a review request yet
    const completedJobs = (await sql `
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
	`);
    for (const job of completedJobs) {
        const channel = job.phone ? "sms" : "email";
        const scheduledFor = new Date(job.completed_at);
        scheduledFor.setHours(scheduledFor.getHours() + 2);
        await sql `
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
export async function dispatchPendingReviewRequests() {
    const sql = getSql();
    let sent = 0;
    let failed = 0;
    const due = (await sql `
		SELECT r.*, c.phone, c.email, c.first_name,
		       comp.name AS company_name
		FROM review_requests r
		JOIN customers c ON c.id = r.customer_id
		JOIN companies comp ON comp.id = r.company_id
		WHERE r.status = 'pending'
		  AND r.scheduled_for <= NOW()
		ORDER BY r.scheduled_for ASC
		LIMIT 100
	`);
    for (const req of due) {
        try {
            // TODO: Integrate Twilio / SendGrid here
            // const message = buildReviewMessage(req);
            // await sendSms(req.phone, message) or sendEmail(req.email, message)
            console.log(`[review] Sending ${req.channel} review request to customer ${req.customer_id} for job ${req.job_id}`);
            await sql `
				UPDATE review_requests SET
					status = 'sent',
					sent_at = NOW(),
					updated_at = NOW()
				WHERE id = ${req.id}
			`;
            sent++;
        }
        catch (err) {
            console.error(`[review] Failed to send request ${req.id}:`, err);
            await sql `
				UPDATE review_requests SET status = 'failed', updated_at = NOW()
				WHERE id = ${req.id}
			`;
            failed++;
        }
    }
    return { sent, failed };
}
// ─────────────────────────────────────────────────────────────────────────────
// MASTER RUNNER — called by /api/cron/run
// ─────────────────────────────────────────────────────────────────────────────
export async function runAllCronJobs() {
    const results = {};
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
    console.log("[cron] Run complete.");
    return results;
}
