// services/app.ts
//
// Fastify app factory for serverless / Next.js API route usage.
// Registers all routes but does NOT start workers or call fastify.listen().
// Used by app/api/[...path]/route.ts to handle requests via fastify.inject().

import Fastify from "fastify";
import fastifyJwt from "@fastify/jwt";
import fastifyRawBody from "fastify-raw-body";

// Core
import { paymentCollectionRoutes } from "./dispatch/paymentCollectionRoutes";
import { jobRoutes } from "./routes/core/jobRoutes";
import { userRoutes } from "./routes/core/userRoutes";
import { companyRoutes } from "./routes/core/companyRoutes";
import { registerEmployeeRoutes } from "./routes/core/employeeRoutes";
import { customerRoutes } from "./routes/core/customerRoutes";
import { branchRoutes } from "./routes/core/branchRoutes";

// Analytics
import { kpiRoutes } from "./routes/analytics/kpiRoutes";
import { leaderboardRoutes } from "./routes/analytics/leaderboardRoutes";
import { forecastRoutes } from "./routes/analytics/forecastRoutes";
import { analyticsRoutes } from "./routes/analytics/analyticsRoutes";
import { reportingRoutes } from "./routes/analytics/reportingRoutes";

// Dispatch
import { dispatchRoutes } from "./routes/dispatch/dispatchRoutes";
import { dispatchAuditRoutes } from "./routes/dispatch/dispatchAuditRoutes";
import { preStaffingAlertRoutes } from "./routes/dispatch/preStaffingAlertRoutes";
import { etaRoutes } from "./routes/dispatch/etaRoutes";
import { employeeLocationRoutes } from "./routes/dispatch/employeeLocationRoutes";

// Integrations
import { stripeRoutes } from "./routes/integrations/stripeRoutes";
import { qbRoutes } from "./routes/integrations/qbRoutes";
import { crmRoutes } from "./routes/integrations/crmRoutes";
import { smsRoutes } from "./routes/integrations/smsRoutes";

// Operational
import { pricebookRoutes } from "./routes/operational/pricebookRoutes";
import { estimateRoutes } from "./routes/operational/estimateRoutes";
import { invoiceRoutes } from "./routes/operational/invoiceRoutes";
import { jobTimeTrackingRoutes } from "./routes/operational/jobTimeTrackingRoutes";
import { durationRoutes } from "./routes/operational/durationRoutes";
import { partsRoutes } from "./routes/operational/partsRoutes";
import { truckInventoryRoutes } from "./routes/operational/truckInventoryRoutes";
import { purchaseOrderRoutes } from "./routes/operational/purchaseOrderRoutes";
import { warehouseRoutes } from "./routes/operational/warehouseRoutes";
import { replacementRoutes } from "./routes/operational/replacementRoutes";
import { refrigerantLogRoutes } from "./routes/operational/refrigerantLogRoutes";

// Platform
import { healthRoutes } from "./routes/platform/healthRoutes";
import { onboardingRoutes } from "./routes/platform/onboardingRoutes";
import { verifyRoutes } from "./routes/platform/verifyRoutes";
import { devRoutes } from "./routes/platform/devRoutes";
import { leadsRoutes } from "./routes/platform/leadsRoutes";
import { auditRoutes } from "./routes/platform/auditRoutes";
import { certificationRoutes } from "./routes/platform/certificationRoutes";

// Remaining
import locationRoutes from "./routes/locationRoutes";
import { competitorPricingRoutes } from "./routes/competitorPricingRoutes";
import { multiRegionRoutes } from "./routes/multiRegionRoutes";
import { tipRoutes } from "./routes/tipRoutes";
import { terminalRoutes } from "./routes/terminalRoutes";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler";

// Singleton — reused across warm serverless invocations
let _app: ReturnType<typeof Fastify> | null = null;
let _initPromise: Promise<ReturnType<typeof Fastify>> | null = null;

async function buildApp() {
	const fastify = Fastify({ logger: false });

	await fastify.register(fastifyRawBody, {
		field: "rawBody",
		global: false,
		encoding: false,
		runFirst: true
	});

	await fastify.register(fastifyJwt, { secret: process.env.JWT_SECRET! });

	fastify.setErrorHandler(errorHandler);
	fastify.setNotFoundHandler(notFoundHandler);

	// Core
	await fastify.register(paymentCollectionRoutes);
	await healthRoutes(fastify);
	await jobRoutes(fastify);
	await userRoutes(fastify);
	await companyRoutes(fastify);
	await registerEmployeeRoutes(fastify);
	await dispatchRoutes(fastify);
	await employeeLocationRoutes(fastify);
	await fastify.register(locationRoutes);
	await fastify.register(pricebookRoutes);
	await fastify.register(estimateRoutes);
	await fastify.register(invoiceRoutes);
	await fastify.register(customerRoutes);
	await fastify.register(branchRoutes);
	await fastify.register(onboardingRoutes);
	await fastify.register(certificationRoutes);
	await fastify.register(durationRoutes);
	await fastify.register(stripeRoutes);
	await fastify.register(qbRoutes);
	await fastify.register(partsRoutes);
	await fastify.register(analyticsRoutes);
	await fastify.register(jobTimeTrackingRoutes);
	await fastify.register(kpiRoutes);
	await fastify.register(dispatchAuditRoutes);
	await fastify.register(refrigerantLogRoutes);
	await fastify.register(replacementRoutes);
	await fastify.register(forecastRoutes);
	await fastify.register(auditRoutes);
	await fastify.register(etaRoutes);
	await fastify.register(leaderboardRoutes);
	await fastify.register(smsRoutes);
	await fastify.register(competitorPricingRoutes);
	await fastify.register(preStaffingAlertRoutes);
	await fastify.register(multiRegionRoutes);
	await fastify.register(warehouseRoutes);
	await fastify.register(truckInventoryRoutes);
	await fastify.register(purchaseOrderRoutes);
	await fastify.register(crmRoutes);
	await fastify.register(reportingRoutes);
	await fastify.register(tipRoutes);
	await fastify.register(terminalRoutes);
	await fastify.register(verifyRoutes);
	await fastify.register(leadsRoutes, { prefix: "/public" });
	await fastify.register(devRoutes);

	fastify.get("/", async () => ({
		status: "running",
		environment: process.env.NODE_ENV || "development"
	}));

	await fastify.ready();
	return fastify;
}

export async function getApp(): Promise<ReturnType<typeof Fastify>> {
	if (_app) return _app;
	if (!_initPromise) {
		_initPromise = buildApp()
			.then((app) => {
				_app = app;
				return app;
			})
			.catch((err) => {
				_initPromise = null;
				throw err;
			});
	}
	return _initPromise;
}
