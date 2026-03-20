// services/routes/qbRoutes.ts
// QuickBooks Online integration.
//
// OAuth2 flow:
//   1. GET  /qb/connect          → redirects user to Intuit auth page
//   2. GET  /qb/callback         → Intuit redirects here with auth code
//   3. Tokens stored in qb_tokens per company
//
// Sync:
//   POST /qb/sync/customer/:customerId  → push customer to QB
//   POST /qb/sync/invoice/:invoiceId    → push invoice to QB
//   POST /qb/sync/all                  → bulk sync unpushed records

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import OAuthClient from "intuit-oauth";
import QuickBooks from "node-quickbooks";
import { getSql } from "../../db";
import { authenticate, JWTPayload } from "../middleware/auth";

// ============================================================
// OAuth client factory
// ============================================================

function getOAuthClient(): OAuthClient {
	return new OAuthClient({
		clientId: process.env.QB_CLIENT_ID!,
		clientSecret: process.env.QB_CLIENT_SECRET!,
		environment:
			(process.env.QB_ENVIRONMENT as "sandbox" | "production") ?? "sandbox",
		redirectUri: process.env.QB_REDIRECT_URI!
	});
}

function getQBClient(accessToken: string, realmId: string): QuickBooks {
	const isSandbox = (process.env.QB_ENVIRONMENT ?? "sandbox") === "sandbox";
	return new QuickBooks(
		process.env.QB_CLIENT_ID!,
		process.env.QB_CLIENT_SECRET!,
		accessToken,
		false, // no token secret (OAuth2)
		realmId,
		isSandbox, // use sandbox
		false, // enable debugging
		null, // minor version
		"2.0", // OAuth version
		null // refresh token (managed separately)
	);
}

// ============================================================
// Helpers
// ============================================================

function getUser(request: any): JWTPayload {
	return request.user as JWTPayload;
}

function isDev(user: JWTPayload): boolean {
	return user.role === "dev";
}

function resolveCompanyId(user: JWTPayload): string | null {
	return user.companyId ?? null;
}

// Refresh token if within 5 minutes of expiry
async function getValidToken(companyId: string): Promise<{
	accessToken: string;
	realmId: string;
} | null> {
	const sql = getSql();

	const [tokenRow] = (await sql`
		SELECT
			access_token, refresh_token, realm_id,
			access_token_expires_at, refresh_token_expires_at
		FROM qb_tokens
		WHERE company_id = ${companyId}
	`) as any[];

	if (!tokenRow) return null;

	// Refresh token expired — user must re-auth
	if (new Date(tokenRow.refresh_token_expires_at) < new Date()) {
		return null;
	}

	// Access token still valid
	const expiresAt = new Date(tokenRow.access_token_expires_at);
	const fiveMinutes = 5 * 60 * 1000;
	if (expiresAt.getTime() - Date.now() > fiveMinutes) {
		return { accessToken: tokenRow.access_token, realmId: tokenRow.realm_id };
	}

	// Access token expired — refresh it
	const oauthClient = getOAuthClient();
	oauthClient.setToken({
		refresh_token: tokenRow.refresh_token,
		access_token: tokenRow.access_token
	});

	const authResponse = await oauthClient.refresh();
	const token = authResponse.getJson();

	await sql`
		UPDATE qb_tokens SET
			access_token              = ${token.access_token},
			refresh_token             = ${token.refresh_token ?? tokenRow.refresh_token},
			access_token_expires_at   = ${new Date(Date.now() + token.expires_in * 1000).toISOString()},
			refresh_token_expires_at  = ${new Date(Date.now() + token.x_refresh_token_expires_in * 1000).toISOString()},
			updated_at                = NOW()
		WHERE company_id = ${companyId}
	`;

	return { accessToken: token.access_token, realmId: tokenRow.realm_id };
}

// Push a customer record to QuickBooks
async function syncCustomerToQB(
	qb: QuickBooks,
	customer: any
): Promise<string> {
	return new Promise((resolve, reject) => {
		const payload = {
			DisplayName: `${customer.first_name} ${customer.last_name}`.trim(),
			GivenName: customer.first_name,
			FamilyName: customer.last_name,
			PrimaryEmailAddr: customer.email
				? { Address: customer.email }
				: undefined,
			PrimaryPhone: customer.phone
				? { FreeFormNumber: customer.phone }
				: undefined,
			BillAddr: {
				Line1: customer.address,
				City: customer.city,
				CountrySubDivisionCode: customer.state,
				PostalCode: customer.zip,
				Country: "US"
			}
		};

		if (customer.qb_customer_id) {
			// Update existing QB customer
			qb.updateCustomer(
				{ ...payload, Id: customer.qb_customer_id, sparse: true },
				(err: any, result: any) => {
					if (err) return reject(err);
					resolve(result.Id);
				}
			);
		} else {
			// Create new QB customer
			qb.createCustomer(payload, (err: any, result: any) => {
				if (err) return reject(err);
				resolve(result.Id);
			});
		}
	});
}

// Push an invoice to QuickBooks
async function syncInvoiceToQB(
	qb: QuickBooks,
	invoice: any,
	lineItems: any[],
	qbCustomerId: string
): Promise<string> {
	return new Promise((resolve, reject) => {
		const qbLineItems = lineItems.map((li: any, index: number) => ({
			DetailType: "SalesItemLineDetail",
			Amount: li.quantity * li.unit_price,
			Description: li.name,
			SalesItemLineDetail: {
				Qty: li.quantity,
				UnitPrice: li.unit_price
			},
			LineNum: index + 1
		}));

		const payload = {
			CustomerRef: { value: qbCustomerId },
			Line: qbLineItems,
			DueDate: invoice.due_date
				? new Date(invoice.due_date).toISOString().split("T")[0]
				: undefined,
			DocNumber: invoice.invoice_number,
			PrivateNote: invoice.notes ?? undefined,
			TxnDate: new Date(invoice.created_at).toISOString().split("T")[0]
		};

		if (invoice.qb_invoice_id) {
			qb.updateInvoice(
				{ ...payload, Id: invoice.qb_invoice_id, sparse: true },
				(err: any, result: any) => {
					if (err) return reject(err);
					resolve(result.Id);
				}
			);
		} else {
			qb.createInvoice(payload, (err: any, result: any) => {
				if (err) return reject(err);
				resolve(result.Id);
			});
		}
	});
}

// ============================================================
// Routes
// ============================================================

export async function qbRoutes(fastify: FastifyInstance) {
	// ----------------------------------------------------------
	// GET /qb/connect
	// Step 1: Redirect user to Intuit auth page.
	// ----------------------------------------------------------
	fastify.get(
		"/qb/connect",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const oauthClient = getOAuthClient();
			const authUri = oauthClient.authorizeUri({
				scope: [OAuthClient.scopes.Accounting],
				state: "qb-oauth" // CSRF token — harden in production
			});
			return reply.redirect(authUri);
		}
	);

	// ----------------------------------------------------------
	// GET /qb/callback
	// Step 2: Intuit redirects here with auth code.
	// Exchange code for tokens, store in qb_tokens.
	// ----------------------------------------------------------
	fastify.get(
		"/qb/callback",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);

			if (!companyId && !isDev(user)) {
				return reply.code(403).send({ error: "Forbidden" });
			}

			const oauthClient = getOAuthClient();
			const sql = getSql();

			try {
				const authResponse = await oauthClient.createToken(request.url);
				const token = authResponse.getJson();
				const realmId = oauthClient.getToken().realmId;

				await sql`
					INSERT INTO qb_tokens (
						company_id, realm_id,
						access_token, refresh_token,
						access_token_expires_at, refresh_token_expires_at
					) VALUES (
						${companyId},
						${realmId},
						${token.access_token},
						${token.refresh_token},
						${new Date(Date.now() + token.expires_in * 1000).toISOString()},
						${new Date(Date.now() + token.x_refresh_token_expires_in * 1000).toISOString()}
					)
					ON CONFLICT (company_id) DO UPDATE SET
						realm_id                  = EXCLUDED.realm_id,
						access_token              = EXCLUDED.access_token,
						refresh_token             = EXCLUDED.refresh_token,
						access_token_expires_at   = EXCLUDED.access_token_expires_at,
						refresh_token_expires_at  = EXCLUDED.refresh_token_expires_at,
						updated_at                = NOW()
				`;

				return reply.send({ message: "QuickBooks connected successfully" });
			} catch (err: any) {
				fastify.log.error("QB OAuth callback error:", err);
				return reply.code(500).send({ error: "Failed to connect QuickBooks" });
			}
		}
	);

	// ----------------------------------------------------------
	// GET /qb/status
	// Check if QB is connected for this company.
	// ----------------------------------------------------------
	fastify.get(
		"/qb/status",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const [tokenRow] = (await sql`
				SELECT
					realm_id,
					access_token_expires_at,
					refresh_token_expires_at,
					updated_at
				FROM qb_tokens
				WHERE company_id = ${companyId}
			`) as any[];

			if (!tokenRow) {
				return reply.send({ connected: false });
			}

			const refreshExpired =
				new Date(tokenRow.refresh_token_expires_at) < new Date();

			return reply.send({
				connected: !refreshExpired,
				realmId: tokenRow.realm_id,
				needsReauth: refreshExpired,
				lastUpdated: tokenRow.updated_at
			});
		}
	);

	// ----------------------------------------------------------
	// DELETE /qb/disconnect
	// Remove stored tokens — disconnect QB.
	// ----------------------------------------------------------
	fastify.delete(
		"/qb/disconnect",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			await sql`DELETE FROM qb_tokens WHERE company_id = ${companyId}`;

			return reply.send({ message: "QuickBooks disconnected" });
		}
	);

	// ----------------------------------------------------------
	// POST /qb/sync/customer/:customerId
	// Push a single customer to QuickBooks.
	// Creates or updates based on qb_customer_id presence.
	// ----------------------------------------------------------
	fastify.post(
		"/qb/sync/customer/:customerId",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { customerId } = request.params as { customerId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const tokenData = await getValidToken(companyId!);
			if (!tokenData) {
				return reply.code(401).send({
					error:
						"QuickBooks not connected or token expired. Re-authenticate at /qb/connect"
				});
			}

			const [customer] = (await sql`
				SELECT * FROM customers
				WHERE id = ${customerId}
					AND (${isDev(user) && !companyId} OR company_id = ${companyId})
			`) as any[];

			if (!customer)
				return reply.code(404).send({ error: "Customer not found" });

			const qb = getQBClient(tokenData.accessToken, tokenData.realmId);

			try {
				const qbCustomerId = await syncCustomerToQB(qb, customer);

				await sql`
					UPDATE customers
					SET qb_customer_id = ${qbCustomerId}, updated_at = NOW()
					WHERE id = ${customerId}
				`;

				return reply.send({
					message: "Customer synced to QuickBooks",
					qbCustomerId
				});
			} catch (err: any) {
				fastify.log.error("QB customer sync error:", err);
				return reply.code(500).send({
					error: "Failed to sync customer to QuickBooks",
					detail: err.message
				});
			}
		}
	);

	// ----------------------------------------------------------
	// POST /qb/sync/invoice/:invoiceId
	// Push a single invoice to QuickBooks.
	// Auto-syncs customer first if not yet in QB.
	// ----------------------------------------------------------
	fastify.post(
		"/qb/sync/invoice/:invoiceId",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const { invoiceId } = request.params as { invoiceId: string };
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const tokenData = await getValidToken(companyId!);
			if (!tokenData) {
				return reply.code(401).send({
					error:
						"QuickBooks not connected or token expired. Re-authenticate at /qb/connect"
				});
			}

			const [invoice] = (await sql`
				SELECT i.*, c.first_name, c.last_name, c.email, c.phone,
					c.address, c.city, c.state, c.zip,
					c.qb_customer_id, c.id AS customer_record_id
				FROM invoices i
				JOIN customers c ON c.id = i.customer_id
				WHERE i.id = ${invoiceId}
					AND (${isDev(user) && !companyId} OR i.company_id = ${companyId})
			`) as any[];

			if (!invoice) return reply.code(404).send({ error: "Invoice not found" });

			const lineItems = (await sql`
				SELECT name, quantity, unit_price, item_type
				FROM invoice_line_items
				WHERE invoice_id = ${invoiceId}
				ORDER BY sort_order
			`) as any[];

			const qb = getQBClient(tokenData.accessToken, tokenData.realmId);

			try {
				// Ensure customer exists in QB first
				let qbCustomerId = invoice.qb_customer_id;
				if (!qbCustomerId) {
					qbCustomerId = await syncCustomerToQB(qb, invoice);
					await sql`
						UPDATE customers
						SET qb_customer_id = ${qbCustomerId}, updated_at = NOW()
						WHERE id = ${invoice.customer_record_id}
					`;
				}

				const qbInvoiceId = await syncInvoiceToQB(
					qb,
					invoice,
					lineItems,
					qbCustomerId
				);

				await sql`
					UPDATE invoices
					SET qb_invoice_id = ${qbInvoiceId}, updated_at = NOW()
					WHERE id = ${invoiceId}
				`;

				return reply.send({
					message: "Invoice synced to QuickBooks",
					qbInvoiceId,
					qbCustomerId
				});
			} catch (err: any) {
				fastify.log.error("QB invoice sync error:", err);
				return reply.code(500).send({
					error: "Failed to sync invoice to QuickBooks",
					detail: err.message
				});
			}
		}
	);

	// ----------------------------------------------------------
	// POST /qb/sync/all
	// Bulk sync: push all unsynced invoices + customers to QB.
	// Runs sequentially to avoid QB rate limits.
	// ----------------------------------------------------------
	fastify.post(
		"/qb/sync/all",
		{ preHandler: [authenticate] },
		async (request: FastifyRequest, reply: FastifyReply) => {
			const user = getUser(request);
			const companyId = resolveCompanyId(user);
			const sql = getSql();

			const tokenData = await getValidToken(companyId!);
			if (!tokenData) {
				return reply.code(401).send({
					error:
						"QuickBooks not connected or token expired. Re-authenticate at /qb/connect"
				});
			}

			const qb = getQBClient(tokenData.accessToken, tokenData.realmId);

			// Unsynced customers
			const customers = (await sql`
				SELECT * FROM customers
				WHERE company_id = ${companyId}
					AND is_active = true
					AND qb_customer_id IS NULL
			`) as any[];

			// Unsynced invoices (only sent/paid — not drafts)
			const invoices = (await sql`
				SELECT i.*, c.qb_customer_id, c.id AS customer_record_id,
					c.first_name, c.last_name, c.email, c.phone,
					c.address, c.city, c.state, c.zip
				FROM invoices i
				JOIN customers c ON c.id = i.customer_id
				WHERE i.company_id = ${companyId}
					AND i.qb_invoice_id IS NULL
					AND i.status IN ('sent', 'paid', 'partial', 'overdue')
			`) as any[];

			const results = {
				customersSynced: 0,
				customersErrored: 0,
				invoicesSynced: 0,
				invoicesErrored: 0
			};

			// Sync customers first
			for (const customer of customers) {
				try {
					const qbCustomerId = await syncCustomerToQB(qb, customer);
					await sql`
						UPDATE customers SET qb_customer_id = ${qbCustomerId}, updated_at = NOW()
						WHERE id = ${customer.id}
					`;
					results.customersSynced++;
				} catch {
					results.customersErrored++;
				}
			}

			// Sync invoices
			for (const invoice of invoices) {
				try {
					const lineItems = (await sql`
						SELECT name, quantity, unit_price, item_type
						FROM invoice_line_items
						WHERE invoice_id = ${invoice.id}
						ORDER BY sort_order
					`) as any[];

					// Refresh qb_customer_id in case we just synced it above
					const [freshCustomer] = (await sql`
						SELECT qb_customer_id FROM customers WHERE id = ${invoice.customer_record_id}
					`) as any[];

					const qbCustomerId =
						freshCustomer?.qb_customer_id ?? invoice.qb_customer_id;

					if (!qbCustomerId) {
						results.invoicesErrored++;
						continue;
					}

					const qbInvoiceId = await syncInvoiceToQB(
						qb,
						invoice,
						lineItems,
						qbCustomerId
					);
					await sql`
						UPDATE invoices SET qb_invoice_id = ${qbInvoiceId}, updated_at = NOW()
						WHERE id = ${invoice.id}
					`;
					results.invoicesSynced++;
				} catch {
					results.invoicesErrored++;
				}
			}

			return reply.send({ message: "Bulk sync complete", results });
		}
	);
}
