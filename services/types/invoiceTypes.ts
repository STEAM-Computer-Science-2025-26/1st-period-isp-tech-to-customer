/* File: invoiceTypes.ts
Overview: Type definitions for invoice-related operations (HVAC billing)
Types:
  InvoiceStatus: All possible invoice statuses
  LineItemInput: Input shape for a single line item (create/update)
  LineItem: Full line item shape exposed via API
  InvoiceDTO: Canonical invoice shape exposed via API
  CreateInvoiceInput: Input for creating a new invoice
  UpdateInvoiceInput: Input for updating an invoice
  GetInvoicesInput: Input for fetching/filtering invoices
  GetInvoicesSuccess: Success response with invoice list
  InvoiceStats: Aggregate financial stats for a company
*/

import { ISODateString, PaginationInput } from "./commonTypes";

export type InvoiceStatus =
	| "draft"
	| "sent"
	| "partial"
	| "paid"
	| "overdue"
	| "void";

/**
 * Input shape for a line item (used in create / replace operations)
 */
export type LineItemInput = {
	pricebookItemId?: string;
	itemType: "labor" | "part" | "bundle" | "custom";
	name: string;
	description?: string;
	quantity: number;
	unitPrice: number;
	unitCost?: number;
	taxable?: boolean;
	sortOrder?: number;
};

/**
 * Full line item shape returned by the API
 */
export type LineItem = {
	id: string;
	invoiceId: string;
	pricebookItemId?: string | null;
	itemType: "labor" | "part" | "bundle" | "custom";
	name: string;
	description?: string | null;
	quantity: number;
	unitPrice: number;
	unitCost?: number | null;
	taxable: boolean;
	sortOrder: number;
};

/**
 * Canonical invoice shape exposed via API
 */
export type InvoiceDTO = {
	id: string;
	companyId: string;

	// References
	customerId: string;
	customerName?: string;
	customerEmail?: string | null;
	customerPhone?: string | null;
	jobId?: string | null;
	estimateId?: string | null;

	// Numbering & status
	invoiceNumber: string;
	status: InvoiceStatus;

	// Financials
	subtotal: number;
	taxRate: number;
	taxAmount: number;
	total: number;
	amountPaid: number;
	balanceDue: number;

	// Dates
	issueDate: string; // ISO date (YYYY-MM-DD)
	dueDate?: string | null;

	// Metadata
	notes?: string | null;
	sentAt?: ISODateString | null;
	paidAt?: ISODateString | null;
	stripePaymentIntentId?: string | null;
	createdBy?: string | null;
	createdAt: ISODateString;
	updatedAt?: ISODateString | null;

	// Populated on detail endpoint
	lineItems?: LineItem[];
};

/**
 * Create invoice
 */
export type CreateInvoiceInput = {
	customerId: string;
	jobId?: string;
	estimateId?: string;
	taxRate?: number; // decimal, e.g. 0.0825 for 8.25%
	issueDate?: string; // ISO date; defaults to today
	dueDate?: string; // ISO date
	notes?: string;
	lineItems: LineItemInput[];
};

/**
 * Update invoice (partial — omit any field to leave it unchanged)
 */
export type UpdateInvoiceInput = {
	invoiceId: string;
	status?: InvoiceStatus;
	taxRate?: number;
	dueDate?: string;
	notes?: string;
	amountPaid?: number;
	stripePaymentIntentId?: string;
};

/**
 * Get invoices (with optional filters)
 */
export type GetInvoicesInput = PaginationInput<
	"createdAt" | "dueDate" | "total"
> & {
	companyId: string;
	status?: InvoiceStatus;
	customerId?: string;
	jobId?: string;
	// Date range (ISO date strings)
	issuedAfter?: string;
	issuedBefore?: string;
	// Amount range
	minTotal?: number;
	maxTotal?: number;
};

export type GetInvoicesSuccess = {
	invoices: InvoiceDTO[];
	limit: number;
	offset: number;
};

/**
 * Aggregate financial stats for a company's invoices
 */
export type InvoiceStats = {
	totalOutstanding: number; // sum of balance_due for sent/partial/overdue invoices
	totalPaidThisMonth: number; // sum of total for invoices paid in the current calendar month
	overdueCount: number; // count of invoices that are effectively overdue
	totalRevenue: number; // sum of total for all paid invoices (all time)
};
