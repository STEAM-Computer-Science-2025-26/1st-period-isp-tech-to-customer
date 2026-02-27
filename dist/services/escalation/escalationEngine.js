// services/escalation/escalationEngine.ts
// Core escalation logic.
// - triggerEscalation(jobId): finds matching policy and starts escalation event
// - advanceEscalation(): called by cron, processes next steps for active events
// - resolveEscalation(eventId, resolvedBy, notes): marks event resolved
import { getSql } from "@/db/connection";
// ─────────────────────────────────────────────────────────────────────────────
// Policy matching: check if a job matches a policy's trigger conditions
// ─────────────────────────────────────────────────────────────────────────────
function jobMatchesPolicy(job, conditions) {
    if (!conditions || Object.keys(conditions).length === 0)
        return true;
    // Keyword match in description or job_type
    if (conditions.keywords?.length) {
        const haystack = `${job.description ?? ""} ${job.jobType ?? ""}`.toLowerCase();
        const matches = conditions.keywords.some((kw) => haystack.includes(kw.toLowerCase()));
        if (!matches)
            return false;
    }
    // Priority match
    if (conditions.priority?.length) {
        if (!conditions.priority.includes(job.priority ?? "normal"))
            return false;
    }
    // Job type match
    if (conditions.jobTypes?.length) {
        if (!conditions.jobTypes.includes(job.jobType ?? ""))
            return false;
    }
    return true;
}
// ─────────────────────────────────────────────────────────────────────────────
// Trigger escalation for a job
// ─────────────────────────────────────────────────────────────────────────────
export async function triggerEscalation(jobId) {
    const sql = getSql();
    // Fetch job details
    const jobs = (await sql `
		SELECT id, company_id, branch_id, description, job_type, priority, status
		FROM jobs WHERE id = ${jobId}
	`);
    if (jobs.length === 0)
        return { triggered: false, reason: "job not found" };
    const job = jobs[0];
    // Don't escalate already-resolved or completed jobs
    if (["completed", "cancelled"].includes(job.status)) {
        return { triggered: false, reason: "job already terminal" };
    }
    // Check if escalation already active for this job
    const existing = (await sql `
		SELECT id FROM escalation_events
		WHERE job_id = ${jobId} AND status = 'active'
		LIMIT 1
	`);
    if (existing.length > 0) {
        return {
            triggered: false,
            reason: "escalation already active",
            eventId: existing[0].id
        };
    }
    // Find matching policy
    const policies = (await sql `
		SELECT * FROM escalation_policies
		WHERE company_id = ${job.company_id}
		  AND is_active = TRUE
		  AND (branch_id IS NULL OR branch_id = ${job.branch_id ?? null})
		ORDER BY branch_id NULLS LAST
	`);
    let matchedPolicy = null;
    for (const policy of policies) {
        if (jobMatchesPolicy(job, policy.trigger_conditions)) {
            matchedPolicy = policy;
            break;
        }
    }
    if (!matchedPolicy) {
        return { triggered: false, reason: "no matching policy" };
    }
    // Create escalation event
    const [event] = (await sql `
		INSERT INTO escalation_events (
			company_id, job_id, policy_id, current_step, status
		) VALUES (
			${job.company_id}, ${jobId}, ${matchedPolicy.id}, 0, 'active'
		)
		RETURNING id
	`);
    console.log(`[escalation] Triggered for job ${jobId} → event ${event.id} (policy: ${matchedPolicy.name})`);
    // Execute step 0 immediately
    await executeEscalationStep(event.id, matchedPolicy.steps[0], 0);
    return { triggered: true, eventId: event.id };
}
// ─────────────────────────────────────────────────────────────────────────────
// Execute a single escalation step (send notifications)
// ─────────────────────────────────────────────────────────────────────────────
async function executeEscalationStep(eventId, step, stepIndex) {
    if (!step)
        return;
    const sql = getSql();
    const logEntry = {
        step: stepIndex,
        sentAt: new Date().toISOString(),
        recipient: step.notify.join(", "),
        channel: step.channel,
        success: false
    };
    try {
        // TODO: Integrate actual SMS/call/push provider (Twilio, etc.)
        for (const recipient of step.notify) {
            console.log(`[escalation] Step ${stepIndex}: notify ${recipient} via ${step.channel} — ${step.message ?? "Emergency job escalation"}`);
        }
        logEntry.success = true;
    }
    catch (err) {
        console.error(`[escalation] Step ${stepIndex} notification failed:`, err);
    }
    // Append to notification log
    await sql `
		UPDATE escalation_events SET
			notification_log = notification_log || ${JSON.stringify([logEntry])}::jsonb,
			updated_at = NOW()
		WHERE id = ${eventId}
	`;
}
// ─────────────────────────────────────────────────────────────────────────────
// Advance active escalations (called by cron)
// Check each active event: if enough time has passed for next step, execute it.
// ─────────────────────────────────────────────────────────────────────────────
export async function advanceEscalations() {
    const sql = getSql();
    let advanced = 0;
    let timedOut = 0;
    const activeEvents = (await sql `
		SELECT e.*, p.steps
		FROM escalation_events e
		JOIN escalation_policies p ON p.id = e.policy_id
		WHERE e.status = 'active'
	`);
    for (const event of activeEvents) {
        const steps = event.steps ?? [];
        const nextStepIndex = event.current_step + 1;
        if (nextStepIndex >= steps.length) {
            // No more steps — time out
            await sql `
				UPDATE escalation_events SET
					status = 'timed_out', updated_at = NOW()
				WHERE id = ${event.id}
			`;
            timedOut++;
            continue;
        }
        const nextStep = steps[nextStepIndex];
        const lastNotification = event.notification_log.at(-1);
        const lastSentAt = lastNotification?.sentAt
            ? new Date(lastNotification.sentAt)
            : new Date(event.triggered_at);
        const minutesElapsed = (Date.now() - lastSentAt.getTime()) / 60000;
        if (minutesElapsed >= nextStep.delayMinutes) {
            await executeEscalationStep(event.id, nextStep, nextStepIndex);
            await sql `
				UPDATE escalation_events SET
					current_step = ${nextStepIndex}, updated_at = NOW()
				WHERE id = ${event.id}
			`;
            advanced++;
        }
    }
    return { advanced, timedOut };
}
// ─────────────────────────────────────────────────────────────────────────────
// Resolve an escalation event
// ─────────────────────────────────────────────────────────────────────────────
export async function resolveEscalation(eventId, resolvedBy, notes) {
    const sql = getSql();
    await sql `
		UPDATE escalation_events SET
			status = 'resolved',
			resolved_at = NOW(),
			resolved_by = ${resolvedBy},
			resolution_notes = ${notes ?? null},
			updated_at = NOW()
		WHERE id = ${eventId} AND status = 'active'
	`;
}
