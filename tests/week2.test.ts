// tests/week2.test.ts
// Week 2 integration tests — hit the real server at localhost:3001
// Run with: pnpm test tests/week2.test.ts
//
// Covers:
//   - Pricebook (CRUD, search, filter)
//   - Estimates (create, update, convert to invoice)
//   - Invoices (CRUD, payment recording)
//   - Stripe (payment intent creation, payment status)
//   - Parts usage per job
//   - Truck inventory
//   - Payment collection workflow (close job)

import "dotenv/config";
import { getSql } from "../db";
import { get, post, patch, put, del, seedCompanyAndUser, deleteCompany } from "./helpers/api";

// ============================================================
// Shared state
// ============================================================

let token = "";
let companyId = "";
let customerId = "";
let jobId = "";
let pricebookItemId = "";
let estimateId = "";
let invoiceId = "";
let partId = "";
let usageId = "";

// ============================================================
// Setup & teardown
// ============================================================

beforeAll(async () => {
	const seed = await seedCompanyAndUser("w2");
	token = seed.token;
	companyId = seed.companyId;

	const sql = getSql();

	// We don't need a separate customerId for jobs (jobs use customer_name)
	// but we still need it for estimates/invoices
	const [customer] = await sql`
		INSERT INTO customers (company_id, first_name, last_name, email, phone, customer_type, address, city, state, zip)
		VALUES (${companyId}, 'Test', 'Customer', ${"tc-" + Date.now() + "@test.local"}, '214-555-0001', 'residential', '100 Test St', 'Dallas', 'TX', '75201')
		RETURNING id
	` as any[];
	customerId = customer.id;

	// Create a job
	const [job] = await sql`
		INSERT INTO jobs (company_id, customer_name, address, phone, job_type, priority, status)
		VALUES (${companyId}, 'Test Customer', '100 Test St, Dallas, TX 75201', '214-555-0001', 'repair', 'normal', 'assigned')
		RETURNING id
	` as any[];
	jobId = job.id;

	// Seed a part in inventory for parts tests
	const [part] = await sql`
		INSERT INTO parts_inventory (company_id, part_name, part_number, quantity, unit_cost, sell_price, reorder_level)
		VALUES (${companyId}, 'Test Filter', 'FILT-001', 50, 8.00, 15.00, 5)
		RETURNING id
	` as any[];
	partId = part.id;
});

afterAll(async () => {
	await deleteCompany(companyId);
});

// ============================================================
// 1. Pricebook
// ============================================================

describe("Pricebook", () => {
	test("POST /pricebook creates a labor item", async () => {
		const { status, body } = await post("/pricebook", token, {
			itemType: "labor",
			name: "AC Tune-Up",
			description: "Full seasonal tune-up",
			unitPrice: 129.99,
			unitCost: 45.00,
			taxable: false,
			category: "maintenance"
		});
		expect(status).toBe(201);
		expect(body.item).toHaveProperty("id");
		expect(body.item.itemType).toBe("labor");
		pricebookItemId = body.item.id;
	});

	test("POST /pricebook creates a part item", async () => {
		const { status, body } = await post("/pricebook", token, {
			itemType: "part",
			name: "16x25x1 Air Filter",
			sku: "FILT-16251",
			unitPrice: 14.99,
			unitCost: 6.00,
			taxable: true,
			category: "filters"
		});
		expect(status).toBe(201);
		expect(body.item.itemType).toBe("part");
	});

	test("GET /pricebook returns items", async () => {
		const { status, body } = await get("/pricebook", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.items)).toBe(true);
		expect(body.items.some((i: any) => i.id === pricebookItemId)).toBe(true);
	});

	test("GET /pricebook?itemType=labor filters by type", async () => {
		const { status, body } = await get("/pricebook?itemType=labor", token);
		expect(status).toBe(200);
		expect(body.items.every((i: any) => i.itemType === "labor")).toBe(true);
	});

	test("GET /pricebook?search=tune filters by search", async () => {
		const { status, body } = await get("/pricebook?search=tune", token);
		expect(status).toBe(200);
		expect(body.items.some((i: any) => i.name.toLowerCase().includes("tune"))).toBe(true);
	});

	test("GET /pricebook/:id returns the item", async () => {
		const { status, body } = await get(`/pricebook/${pricebookItemId}`, token);
		expect(status).toBe(200);
		expect(body.item.id).toBe(pricebookItemId);
	});

	test("PATCH /pricebook/:id updates price", async () => {
		const { status, body } = await patch(`/pricebook/${pricebookItemId}`, token, {
			unitPrice: 149.99
		});
		expect(status).toBe(200);
		expect(body.item.unitPrice).toBeCloseTo(149.99);
	});

	test("PATCH /pricebook/:id with empty body returns 400", async () => {
		const { status } = await patch(`/pricebook/${pricebookItemId}`, token, {});
		expect(status).toBe(400);
	});

	test("DELETE /pricebook/:id soft-deletes item", async () => {
		const { body: created } = await post("/pricebook", token, {
			itemType: "bundle",
			name: "Delete Me Bundle",
			unitPrice: 299.00
		});
		const { status } = await del(`/pricebook/${created.item.id}`, token);
		expect(status).toBe(200);
	});
});

// ============================================================
// 2. Estimates
// ============================================================

describe("Estimates", () => {
	test("POST /estimates creates an estimate", async () => {
		const { status, body } = await post("/estimates", token, {
			customerId,
			jobId,
			tier: "good",
			taxRate: 0.0825,
			notes: "Standard repair estimate",
			lineItems: [
				{
					pricebookItemId,
					itemType: "labor",
					name: "AC Tune-Up",
					quantity: 1,
					unitPrice: 149.99,
					taxable: false
				},
				{
					itemType: "part",
					name: "Capacitor",
					quantity: 2,
					unitPrice: 35.00,
					unitCost: 12.00,
					taxable: true
				}
			]
		});
		expect(status).toBe(201);
		expect(body.estimate).toHaveProperty("id");
		expect(body.estimate.tier).toBe("good");
		estimateId = body.estimate.id;
	});

	test("GET /estimates returns list", async () => {
		const { status, body } = await get("/estimates", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.estimates)).toBe(true);
		expect(body.estimates.some((e: any) => e.id === estimateId)).toBe(true);
	});

	test("GET /estimates/:id returns estimate with line items", async () => {
		const { status, body } = await get(`/estimates/${estimateId}`, token);
		expect(status).toBe(200);
		expect(body.estimate.id).toBe(estimateId);
		expect(Array.isArray(body.estimate.lineItems)).toBe(true);
		expect(body.estimate.lineItems.length).toBe(2);
	});

	test("GET /estimates?customerId= filters correctly", async () => {
		const { status, body } = await get(`/estimates?customerId=${customerId}`, token);
		expect(status).toBe(200);
		expect(body.estimates.every((e: any) => e.customerId === customerId)).toBe(true);
	});

	test("PATCH /estimates/:id updates status", async () => {
		const { status, body } = await patch(`/estimates/${estimateId}`, token, {
			status: "sent"
		});
		expect(status).toBe(200);
		expect(body.estimate.status).toBe("sent");
	});

	test("PUT /estimates/:id/line-items replaces all line items", async () => {
		const { status, body } = await put(`/estimates/${estimateId}/line-items`, token, {
			lineItems: [
				{
					itemType: "labor",
					name: "Diagnostic Fee",
					quantity: 1,
					unitPrice: 89.00,
					taxable: false
				}
			]
		});
		expect(status).toBe(200);
		expect(body.lineItems.length).toBe(1);
		expect(body.lineItems[0].name).toBe("Diagnostic Fee");
	});

	test("POST /estimates with no line items returns 400", async () => {
		const { status } = await post("/estimates", token, {
			customerId,
			taxRate: 0.0825,
			lineItems: []
		});
		expect(status).toBe(400);
	});

	test("POST /estimates/:id/convert creates invoice from estimate", async () => {
		// First add a line item back (we replaced them above)
		await put(`/estimates/${estimateId}/line-items`, token, {
			lineItems: [
				{
					itemType: "labor",
					name: "Full Service",
					quantity: 1,
					unitPrice: 199.00,
					taxable: true
				}
			]
		});

		const { status, body } = await post(`/estimates/${estimateId}/convert`, token, {});
		expect(status).toBe(201);
		expect(body.invoice).toHaveProperty("id");
		expect(body.invoice.invoiceNumber).toMatch(/^INV-/);
		invoiceId = body.invoice.id;
	});
});

// ============================================================
// 3. Invoices
// ============================================================

describe("Invoices", () => {
	test("GET /invoices returns list", async () => {
		const { status, body } = await get("/invoices", token);
		expect(status).toBe(200);
		expect(Array.isArray(body.invoices)).toBe(true);
	});

	test("GET /invoices/:id returns invoice with line items", async () => {
		const { status, body } = await get(`/invoices/${invoiceId}`, token);
		expect(status).toBe(200);
		expect(body.invoice.id).toBe(invoiceId);
		expect(body.invoice).toHaveProperty("lineItems");
		expect(body.invoice).toHaveProperty("balanceDue");
	});

	test("PATCH /invoices/:id updates status to sent", async () => {
		const { status, body } = await patch(`/invoices/${invoiceId}`, token, {
			status: "sent"
		});
		expect(status).toBe(200);
		expect(body.invoice.status).toBe("sent");
	});

	test("POST /invoices/:id/payment records a cash payment", async () => {
		const { status, body } = await post(`/invoices/${invoiceId}/payment`, token, {
			amount: 50.00,
			method: "cash",
			notes: "Partial payment received"
		});
		expect(status).toBe(200);
		expect(["partial", "paid"]).toContain(body.invoice.status);
		expect(Number(body.invoice.amountPaid)).toBeGreaterThan(0);
	});

	test("GET /invoices/:id after payment shows updated amount", async () => {
		const { status, body } = await get(`/invoices/${invoiceId}`, token);
		expect(status).toBe(200);
		expect(Number(body.invoice.amountPaid)).toBeGreaterThanOrEqual(50);
	});

	test("GET /invoices/:bad-id returns 404", async () => {
		const { status } = await get("/invoices/00000000-0000-0000-0000-000000000000", token);
		expect(status).toBe(404);
	});

	test("POST /invoices creates a standalone invoice", async () => {
		const { status, body } = await post("/invoices", token, {
			customerId,
			taxRate: 0.0825,
			lineItems: [
				{
					itemType: "labor",
					name: "Emergency Call",
					quantity: 1,
					unitPrice: 249.00,
					taxable: false
				}
			]
		});
		expect(status).toBe(201);
		expect(body.invoice).toHaveProperty("id");
		expect(body.invoice.invoiceNumber).toMatch(/^INV-/);
	});
});

// ============================================================
// 4. Stripe
// ============================================================

describe("Stripe", () => {
	test("POST /stripe/payment-intent returns clientSecret", async () => {
		// Need a fresh unpaid invoice with a balance
		const { body: inv } = await post("/invoices", token, {
			customerId,
			taxRate: 0,
			lineItems: [
				{
					itemType: "labor",
					name: "Stripe Test Service",
					quantity: 1,
					unitPrice: 100.00,
					taxable: false
				}
			]
		});
		const stripeInvoiceId = inv.invoice.id;

		const { status, body } = await post("/stripe/payment-intent", token, {
			invoiceId: stripeInvoiceId,
			paymentMethodType: "card"
		});

		// Will succeed if STRIPE_SECRET_KEY is set, otherwise 500
		if (status === 200) {
			expect(body).toHaveProperty("clientSecret");
			expect(body.clientSecret).toMatch(/^pi_/);
			expect(body).toHaveProperty("paymentIntentId");

			// GET payment status
			const { status: ps, body: psBody } = await get(
				`/stripe/payment-status/${stripeInvoiceId}`,
				token
			);
			expect(ps).toBe(200);
			expect(psBody).toHaveProperty("stripeStatus");
		} else {
			// Stripe not configured — acceptable in CI without keys
			console.warn("Stripe test skipped — STRIPE_SECRET_KEY not set");
			expect([500, 503]).toContain(status);
		}
	});

	test("POST /stripe/payment-intent on already-paid invoice returns 409", async () => {
		// Mark our invoice as paid first
		await patch(`/invoices/${invoiceId}`, token, { status: "paid", amountPaid: 999 });

		const { status } = await post("/stripe/payment-intent", token, {
			invoiceId,
			paymentMethodType: "card"
		});
		expect(status).toBe(409);
	});
});

// ============================================================
// 5. Parts usage
// ============================================================

describe("Parts Usage", () => {
	test("POST /jobs/:jobId/parts logs usage and decrements inventory", async () => {
		const { status, body } = await post(`/jobs/${jobId}/parts`, token, {
			partId,
			quantityUsed: 3,
			notes: "Used during repair"
		});
		expect(status).toBe(201);
		expect(body.usage).toHaveProperty("id");
		expect(body.usage.quantityUsed).toBe(3);
		expect(typeof body.remainingStock).toBe("number");
		expect(body.remainingStock).toBe(47); // started at 50
		usageId = body.usage.id;
	});

	test("POST /jobs/:jobId/parts with quantity > stock returns 409", async () => {
		const { status } = await post(`/jobs/${jobId}/parts`, token, {
			partId,
			quantityUsed: 9999
		});
		expect(status).toBe(409);
	});

	test("GET /jobs/:jobId/parts returns usage log", async () => {
		const { status, body } = await get(`/jobs/${jobId}/parts`, token);
		expect(status).toBe(200);
		expect(Array.isArray(body.partsUsed)).toBe(true);
		expect(body.partsUsed.some((p: any) => p.id === usageId)).toBe(true);
	});

	test("DELETE /jobs/:jobId/parts/:usageId restores inventory", async () => {
		const sql = getSql();
		const [before] = await sql`SELECT quantity FROM parts_inventory WHERE id = ${partId}` as any[];
		const stockBefore = before.quantity;

		const { status } = await del(`/jobs/${jobId}/parts/${usageId}`, token);
		expect(status).toBe(200);

		const [after] = await sql`SELECT quantity FROM parts_inventory WHERE id = ${partId}` as any[];
		expect(after.quantity).toBe(stockBefore + 3);
	});

	test("POST /jobs/:jobId/parts with deductFromTruck=true but no vehicleId returns 400", async () => {
		const { status } = await post(`/jobs/${jobId}/parts`, token, {
			partId,
			quantityUsed: 1,
			deductFromTruck: true
			// missing vehicleId
		});
		expect(status).toBe(400);
	});
});

// ============================================================
// 6. Truck inventory
// ============================================================

describe("Truck Inventory", () => {
	const vehicleId = "TRUCK-001";

	test("PUT /truck-inventory sets stock for a vehicle", async () => {
		const { status, body } = await put("/truck-inventory", token, {
			vehicleId,
			partId,
			quantity: 10,
			minQuantity: 2
		});
		expect(status).toBe(200);
		expect(body.inventory).toHaveProperty("id");
		expect(body.inventory.quantity).toBe(10);
	});

	test("GET /truck-inventory?vehicleId= returns inventory", async () => {
		const { status, body } = await get(`/truck-inventory?vehicleId=${vehicleId}`, token);
		expect(status).toBe(200);
		expect(Array.isArray(body.inventory)).toBe(true);
		expect(body.inventory.some((i: any) => i.vehicleId === vehicleId)).toBe(true);
	});

	test("GET /truck-inventory?lowStockOnly=true returns only low stock", async () => {
		// Set a part to 1 (below minQuantity of 2)
		await put("/truck-inventory", token, {
			vehicleId,
			partId,
			quantity: 1,
			minQuantity: 2
		});
		const { status, body } = await get(`/truck-inventory?vehicleId=${vehicleId}&lowStockOnly=true`, token);
		expect(status).toBe(200);
		expect(body.inventory.every((i: any) => i.quantity <= i.minQuantity)).toBe(true);
	});

	test("PATCH /truck-inventory/:vehicleId/:partId adjusts quantity", async () => {
		const { status, body } = await patch(`/truck-inventory/${vehicleId}/${partId}`, token, {
			quantity: 5 // restock +5
		});
		expect(status).toBe(200);
		expect(body.inventory.quantity).toBe(6); // was 1, +5
	});
});

// ============================================================
// 7. Payment collection workflow
// ============================================================

describe("Payment Collection Workflow", () => {
	let closedJobId = "";
	let freshInvoiceId = "";

	beforeAll(async () => {
		const sql = getSql();
		// Create a job in 'assigned' status for close-out
		const [j] = await sql`
			INSERT INTO jobs (company_id, customer_name, address, phone, job_type, priority, status, started_at)
			VALUES (${companyId}, 'Test Customer', '100 Test St, Dallas, TX 75201', '214-555-0001', 'repair', 'normal', 'assigned', NOW() - INTERVAL '2 hours')
			RETURNING id
		` as any[];
		closedJobId = j.id;

		// Create an invoice for it
		const { body } = await post("/invoices", token, {
			customerId,
			jobId: closedJobId,
			taxRate: 0,
			lineItems: [
				{ itemType: "labor", name: "Service Call", quantity: 1, unitPrice: 150.00, taxable: false }
			]
		});
		freshInvoiceId = body.invoice.id;
	});

	test("POST /jobs/:jobId/close with cash payment completes job and marks invoice paid", async () => {
		const { status, body } = await post(`/jobs/${closedJobId}/close`, token, {
			completionNotes: "Fixed capacitor, all working",
			firstTimeFix: true,
			customerRating: 5,
			invoiceId: freshInvoiceId,
			paymentMethod: "cash",
			amountToCollect: 150.00,
			taxRate: 0
		});
		expect(status).toBe(200);
		expect(body.jobStatus).toBe("completed");
		expect(body.invoice.status).toBe("paid");
		expect(Number(body.invoice.amountPaid)).toBe(150);
		expect(body.payment.method).toBe("cash");
	});

	test("GET /jobs/:jobId/payment-summary returns completed job summary", async () => {
		const { status, body } = await get(`/jobs/${closedJobId}/payment-summary`, token);
		expect(status).toBe(200);
		expect(body.job.status).toBe("completed");
		expect(body.invoice).toBeDefined();
		expect(body.job.firstTimeFix).toBe(true);
	});

	test("POST /jobs/:jobId/close with paymentMethod=none closes job, leaves invoice open", async () => {
		const sql = getSql();
		const [j] = await sql`
			INSERT INTO jobs (company_id, customer_name, address, phone, job_type, priority, status)
			VALUES (${companyId}, 'Test Customer', '100 Test St, Dallas, TX 75201', '214-555-0001', 'maintenance', 'normal', 'assigned')
			RETURNING id
		` as any[];

		const { status, body } = await post(`/jobs/${j.id}/close`, token, {
			completionNotes: "Work complete, bill later",
			paymentMethod: "none"
		});
		expect(status).toBe(200);
		expect(body.jobStatus).toBe("completed");
		expect(body.payment.method).toBe("none");
	});

	test("POST /jobs/:jobId/close with check payment records check number", async () => {
		const sql = getSql();
		const [j] = await sql`
			INSERT INTO jobs (company_id, customer_name, address, phone, job_type, priority, status)
			VALUES (${companyId}, 'Test Customer', '100 Test St, Dallas, TX 75201', '214-555-0001', 'repair', 'normal', 'assigned')
			RETURNING id
		` as any[];

		const { body: inv } = await post("/invoices", token, {
			customerId,
			jobId: j.id,
			taxRate: 0,
			lineItems: [{ itemType: "labor", name: "Labor", quantity: 1, unitPrice: 200.00, taxable: false }]
		});

		const { status, body } = await post(`/jobs/${j.id}/close`, token, {
			paymentMethod: "check",
			amountToCollect: 200.00,
			checkNumber: "1042",
			invoiceId: inv.invoice.id
		});
		expect(status).toBe(200);
		expect(body.payment.checkNumber).toBe("1042");
		expect(body.invoice.status).toBe("paid");
	});

	test("POST /jobs/:jobId/close with card returns Stripe clientSecret", async () => {
		const sql = getSql();
		const [j] = await sql`
			INSERT INTO jobs (company_id, customer_name, address, phone, job_type, priority, status)
			VALUES (${companyId}, 'Test Customer', '100 Test St, Dallas, TX 75201', '214-555-0001', 'repair', 'normal', 'assigned')
			RETURNING id
		` as any[];

		const { body: inv } = await post("/invoices", token, {
			customerId,
			jobId: j.id,
			taxRate: 0,
			lineItems: [{ itemType: "labor", name: "Labor", quantity: 1, unitPrice: 175.00, taxable: false }]
		});

		const { status, body } = await post(`/jobs/${j.id}/close`, token, {
			paymentMethod: "card",
			invoiceId: inv.invoice.id
		});

		if (status === 200) {
			expect(body.payment).toHaveProperty("clientSecret");
			expect(body.jobStatus).toBe("completed");
		} else {
			// Stripe not configured
			console.warn("Card payment test skipped — Stripe not configured");
			expect([500, 503]).toContain(status);
		}
	});
});