// services/metrics/index.ts
import { Counter, Histogram, Registry, Gauge } from "prom-client";
// Create registry
export const register = new Registry();
// Dispatch duration histogram
export const dispatchDuration = new Histogram({
	name: "dispatch_duration_seconds",
	help: "Time to complete dispatch operation",
	labelNames: ["success", "manual_required", "company_id"],
	buckets: [0.1, 0.5, 1, 2, 5, 10],
	registers: [register]
});
// Dispatch attempts counter
export const dispatchAttempts = new Counter({
	name: "dispatch_attempts_total",
	help: "Total number of dispatch attempts",
	labelNames: ["status", "company_id", "priority"],
	registers: [register]
});
// Eligible techs gauge
export const eligibleTechsGauge = new Histogram({
	name: "eligible_techs_count",
	help: "Number of eligible techs found per dispatch",
	labelNames: ["company_id"],
	buckets: [0, 1, 2, 3, 5, 10, 20, 50],
	registers: [register]
});
// Assignment success rate
export const assignmentSuccess = new Counter({
	name: "assignment_success_total",
	help: "Number of successful auto-assignments",
	labelNames: ["company_id"],
	registers: [register]
});
export const assignmentManualRequired = new Counter({
	name: "assignment_manual_required_total",
	help: "Number of times manual dispatch was required",
	labelNames: ["company_id", "reason"],
	registers: [register]
});
// Tech workload distribution
export const techWorkloadDistribution = new Histogram({
	name: "tech_workload_jobs",
	help: "Distribution of jobs per tech",
	labelNames: ["company_id"],
	buckets: [0, 1, 2, 3, 4, 5, 10],
	registers: [register]
});
// Geocoding metrics
export const geocodingAttempts = new Counter({
	name: "geocoding_attempts_total",
	help: "Total geocoding attempts",
	labelNames: ["status", "provider"],
	registers: [register]
});
export const geocodingDuration = new Histogram({
	name: "geocoding_duration_seconds",
	help: "Time to geocode an address",
	labelNames: ["status"],
	buckets: [0.1, 0.5, 1, 2, 5],
	registers: [register]
});
// Database query metrics
export const dbQueryDuration = new Histogram({
	name: "db_query_duration_seconds",
	help: "Database query execution time",
	labelNames: ["query_type"],
	buckets: [0.01, 0.05, 0.1, 0.5, 1, 2],
	registers: [register]
});
// API endpoint metrics
export const httpRequestDuration = new Histogram({
	name: "http_request_duration_seconds",
	help: "HTTP request duration",
	labelNames: ["method", "route", "status_code"],
	buckets: [0.1, 0.5, 1, 2, 5, 10],
	registers: [register]
});
export const httpRequestsTotal = new Counter({
	name: "http_requests_total",
	help: "Total HTTP requests",
	labelNames: ["method", "route", "status_code"],
	registers: [register]
});
// Active connections gauge
export const activeConnections = new Gauge({
	name: "active_connections",
	help: "Number of active HTTP connections",
	registers: [register]
});
/**
 * Helper to track dispatch operation with metrics
 */
export async function trackDispatch(operation, companyId, priority) {
	const timer = dispatchDuration.startTimer();
	try {
		const result = await operation();
		dispatchAttempts.inc({
			status: "success",
			company_id: companyId,
			priority
		});
		timer({
			success: "true",
			manual_required: "false",
			company_id: companyId
		});
		return result;
	} catch (error) {
		dispatchAttempts.inc({
			status: "error",
			company_id: companyId,
			priority
		});
		timer({
			success: "false",
			manual_required: "unknown",
			company_id: companyId
		});
		throw error;
	}
}
/**
 * Record dispatch results
 */
export function recordDispatchResult(
	companyId,
	eligibleCount,
	requiresManual,
	reason
) {
	eligibleTechsGauge.observe({ company_id: companyId }, eligibleCount);
	if (requiresManual) {
		assignmentManualRequired.inc({
			company_id: companyId,
			reason: reason || "unknown"
		});
	} else {
		assignmentSuccess.inc({ company_id: companyId });
	}
}
/**
 * Track geocoding operation
 */
export async function trackGeocoding(operation, provider = "geocodio") {
	const timer = geocodingDuration.startTimer();
	try {
		const result = await operation();
		geocodingAttempts.inc({ status: "success", provider });
		timer({ status: "success" });
		return result;
	} catch (error) {
		geocodingAttempts.inc({ status: "error", provider });
		timer({ status: "error" });
		throw error;
	}
}
