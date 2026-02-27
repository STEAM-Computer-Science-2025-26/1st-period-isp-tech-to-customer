// services/dispatch/afterHoursRouter.ts
// Called during job creation / dispatch to apply after-hours rules.
// Returns the applicable rule + surcharges + on-call pool if it's after hours.
import { getSql } from "@/db/connection";
function parseTime(timeStr) {
    const [h, m] = timeStr.split(":").map(Number);
    return { hours: h, minutes: m };
}
function timeToMinutes(timeStr) {
    const { hours, minutes } = parseTime(timeStr);
    return hours * 60 + minutes;
}
function isAfterHoursWindow(now, weekdayStart, weekdayEnd, weekendAllDay) {
    const dayOfWeek = now.getDay(); // 0=Sun, 6=Sat
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    if (isWeekend && weekendAllDay)
        return true;
    // Weekday check
    const nowMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = timeToMinutes(weekdayStart);
    const endMinutes = timeToMinutes(weekdayEnd);
    if (startMinutes > endMinutes) {
        // Wraps midnight: after-hours is startMinutes → midnight OR midnight → endMinutes
        return nowMinutes >= startMinutes || nowMinutes < endMinutes;
    }
    else {
        return nowMinutes >= startMinutes && nowMinutes < endMinutes;
    }
}
export async function evaluateAfterHours(companyId, branchId, at) {
    const checkTime = at ?? new Date();
    const sql = getSql();
    // Fetch active rules for this company/branch
    const rules = (await sql `
		SELECT * FROM after_hours_rules
		WHERE company_id = ${companyId}
		  AND is_active = TRUE
		  AND (branch_id IS NULL OR branch_id = ${branchId ?? null})
		ORDER BY branch_id NULLS LAST
		LIMIT 1
	`);
    if (rules.length === 0) {
        return { isAfterHours: false };
    }
    const rule = rules[0];
    const isAH = isAfterHoursWindow(checkTime, rule.weekday_start, rule.weekday_end, rule.weekend_all_day);
    if (!isAH) {
        return { isAfterHours: false };
    }
    return {
        isAfterHours: true,
        ruleId: rule.id,
        ruleName: rule.name,
        routingStrategy: rule.routing_strategy,
        onCallEmployeeIds: rule.on_call_employee_ids ?? [],
        surchargeFlatFlat: Number(rule.surcharge_flat ?? 0),
        surchargePercent: Number(rule.surcharge_percent ?? 0),
        autoAccept: rule.auto_accept,
        notifyManager: rule.notify_manager,
        managerPhone: rule.manager_phone
    };
}
/**
 * Pick the best on-call tech from the pool.
 * Prefers techs who are available and have fewest active jobs.
 */
export async function pickOnCallTech(onCallEmployeeIds) {
    if (onCallEmployeeIds.length === 0)
        return null;
    const sql = getSql();
    const techs = (await sql `
		SELECT id, is_available, max_concurrent_jobs,
		       (SELECT COUNT(*) FROM jobs
		        WHERE assigned_tech_id = employees.id
		          AND status IN ('assigned','in_progress')) AS active_jobs
		FROM employees
		WHERE id = ANY(${onCallEmployeeIds}::uuid[])
		  AND is_active = TRUE
		ORDER BY active_jobs ASC, is_available DESC
		LIMIT 1
	`);
    return techs.length > 0 ? techs[0].id : null;
}
