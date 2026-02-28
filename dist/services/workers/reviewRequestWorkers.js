// services/workers/reviewRequestWorker.ts
// Cron worker — processes pending review requests whose scheduled_at has passed
// Run every 5 minutes via your existing cron setup
import { getSql } from "../../db";
const DEFAULT_SMS_TEMPLATE =
	"Hi {name}! Thanks for choosing us today. We'd love your feedback — leave us a Google review: {url}";
async function processReviewRequests() {
	const sql = getSql();
	// Grab pending requests that are due
	const pending = await sql`
		SELECT
			rr.id,
			rr.company_id   AS "companyId",
			rr.job_id       AS "jobId",
			rr.customer_id  AS "customerId",
			rr.channel,
			rr.review_url   AS "reviewUrl",
			c.first_name    AS "firstName",
			c.phone,
			c.email,
			cs.twilio_account_sid AS "accountSid",
			cs.twilio_auth_token  AS "authToken",
			cs.twilio_phone       AS "fromPhone",
			cs.review_sms_template AS "smsTemplate"
		FROM review_requests rr
		LEFT JOIN customers c ON c.id = rr.customer_id
		LEFT JOIN company_settings cs ON cs.company_id = rr.company_id
		WHERE rr.status = 'pending'
		  AND rr.scheduled_at <= NOW()
		LIMIT 50
	`;
	console.log(`📬 Review request worker: ${pending.length} pending`);
	for (const req of pending) {
		let success = false;
		try {
			if (
				(req.channel === "sms" || req.channel === "both") &&
				req.phone &&
				req.accountSid
			) {
				const template = req.smsTemplate ?? DEFAULT_SMS_TEMPLATE;
				const body = template
					.replace("{name}", req.firstName ?? "there")
					.replace(
						"{url}",
						`${process.env.APP_URL ?? ""}/reviews/click/${req.id}`
					);
				const twilioUrl = `https://api.twilio.com/2010-04-01/Accounts/${req.accountSid}/Messages.json`;
				const params = new URLSearchParams({
					To: req.phone,
					From: req.fromPhone,
					Body: body
				});
				const res = await fetch(twilioUrl, {
					method: "POST",
					headers: {
						Authorization: `Basic ${Buffer.from(`${req.accountSid}:${req.authToken}`).toString("base64")}`,
						"Content-Type": "application/x-www-form-urlencoded"
					},
					body: params.toString()
				});
				success = res.ok;
				if (!res.ok) {
					const err = await res.json();
					console.error(
						`❌ Twilio error for review request ${req.id}:`,
						err.message
					);
				}
			} else {
				// Email path or no credentials — mark as sent to avoid infinite retry
				// Wire up your email provider here (SendGrid, Resend, etc.)
				success = true;
			}
		} catch (err) {
			console.error(`❌ Failed to send review request ${req.id}:`, err);
		}
		await sql`
			UPDATE review_requests SET
				status   = ${success ? "sent" : "failed"},
				sent_at  = ${success ? new Date().toISOString() : null},
				updated_at = NOW()
			WHERE id = ${req.id}
		`;
	}
	console.log(`✅ Review request worker done`);
}
// Singleton runner
let running = false;
export async function runReviewRequestWorker() {
	if (running) return;
	running = true;
	try {
		await processReviewRequests();
	} finally {
		running = false;
	}
}
// Self-execute if run directly
if (process.argv[1]?.includes("reviewRequestWorker")) {
	runReviewRequestWorker()
		.then(() => process.exit(0))
		.catch((err) => {
			console.error(err);
			process.exit(1);
		});
}
