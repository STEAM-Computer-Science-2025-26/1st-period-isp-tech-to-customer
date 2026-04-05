"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { cn, formatReadableDate } from "@/lib/utils";
import type { Job } from "@/lib/schemas/jobSchemas";
import { InvoiceTimeline } from "./InvoiceTimeline";

type InvoiceStatus =
	| "draft"
	| "sent"
	| "partial"
	| "paid"
	| "overdue"
	| "void";

type InvoiceListItem = {
	id: string;
	invoiceNumber: string;
	status: InvoiceStatus;
	total: number | string;
	issueDate?: string | null;
	dueDate?: string | null;
};

type InvoiceLineItem = {
	id: string;
	name: string;
	description?: string | null;
	quantity: number | string;
	unitPrice: number | string;
};

type InvoiceDetail = InvoiceListItem & {
	amountPaid: number | string;
	balanceDue: number | string;
	notes?: string | null;
	lineItems?: InvoiceLineItem[];
};

type ListInvoicesResponse = {
	invoices: InvoiceListItem[];
	limit: number;
	offset: number;
};

type InvoiceDetailResponse = {
	invoice: InvoiceDetail;
};

type CreateInvoiceResponse = {
	invoice: InvoiceDetail;
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD"
});

const STATUS_STYLES: Record<InvoiceStatus, string> = {
	draft:
		"bg-background-secondary text-text-secondary border border-background-secondary",
	sent: "bg-info-background/15 text-info-text border border-info-foreground/30",
	partial:
		"bg-warning-background/20 text-warning-foreground border border-warning-foreground/30",
	paid: "bg-success-background/15 text-success-text border border-success-foreground/30",
	overdue:
		"bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30",
	void: "bg-background-main text-text-tertiary border border-background-secondary"
};

function toNumber(value: number | string | null | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number | string | null | undefined): string {
	return CURRENCY_FORMATTER.format(toNumber(value));
}

function toStatusLabel(status: InvoiceStatus): string {
	if (status === "overdue") return "Overdue";
	if (status === "partial") return "Partially Paid";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function parseDate(value?: string | null): Date | null {
	if (!value) return null;
	const normalized = value.length <= 10 ? `${value}T00:00:00` : value;
	const date = new Date(normalized);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "Something went wrong while updating invoice data.";
}

export function InvoiceTab({
	job,
	customerId
}: {
	job: Job;
	customerId: string | null;
}) {
	const queryClient = useQueryClient();
	const [actionError, setActionError] = useState<string | null>(null);
	const [actionSuccess, setActionSuccess] = useState<string | null>(null);

	const invoiceListQuery = useQuery({
		queryKey: ["job-invoice-list", job.id],
		queryFn: () =>
			apiFetch<ListInvoicesResponse>(
				`/invoices?jobId=${encodeURIComponent(job.id)}&limit=1`
			)
	});

	const invoiceId = invoiceListQuery.data?.invoices?.[0]?.id ?? null;

	const invoiceDetailQuery = useQuery({
		queryKey: ["job-invoice-detail", invoiceId],
		enabled: !!invoiceId,
		queryFn: () =>
			apiFetch<InvoiceDetailResponse>(`/invoices/${encodeURIComponent(invoiceId!)}`)
	});

	const refreshInvoiceData = async () => {
		await queryClient.invalidateQueries({ queryKey: ["job-invoice-list", job.id] });
		if (invoiceId) {
			await queryClient.invalidateQueries({
				queryKey: ["job-invoice-detail", invoiceId]
			});
		}
	};

	const createInvoiceMutation = useMutation({
		mutationFn: async () => {
			if (!customerId) {
				throw new Error(
					"Unable to create an invoice because this job's customer could not be matched."
				);
			}

			const dueDate = new Date();
			dueDate.setDate(dueDate.getDate() + 30);

			return apiFetch<CreateInvoiceResponse>("/invoices", {
				method: "POST",
				body: JSON.stringify({
					customerId,
					jobId: job.id,
					dueDate: dueDate.toISOString().slice(0, 10),
					notes: `Created from job ${job.id}`,
					lineItems: [
						{
							itemType: "labor",
							name: `${job.jobType.replaceAll("_", " ")} service`,
							description: stripForLineItemDescription(job.address),
							quantity: 1,
							unitPrice: 0,
							taxable: true,
							sortOrder: 0
						}
					]
				})
			});
		},
		onSuccess: async (data) => {
			setActionError(null);
			setActionSuccess(`Invoice ${data.invoice.invoiceNumber} created.`);
			await refreshInvoiceData();
		},
		onError: (error) => {
			setActionSuccess(null);
			setActionError(getErrorMessage(error));
		}
	});

	const markAsSentMutation = useMutation({
		mutationFn: (targetInvoiceId: string) =>
			apiFetch(`/invoices/${targetInvoiceId}/send`, {
				method: "POST",
				body: JSON.stringify({})
			}),
		onSuccess: async () => {
			setActionError(null);
			setActionSuccess("Invoice marked as sent.");
			await refreshInvoiceData();
		},
		onError: (error) => {
			setActionSuccess(null);
			setActionError(getErrorMessage(error));
		}
	});

	const markAsPaidMutation = useMutation({
		mutationFn: (invoice: InvoiceDetail) =>
			apiFetch(`/invoices/${invoice.id}`, {
				method: "PATCH",
				body: JSON.stringify({
					status: "paid",
					amountPaid: toNumber(invoice.total)
				})
			}),
		onSuccess: async () => {
			setActionError(null);
			setActionSuccess("Invoice marked as paid.");
			await refreshInvoiceData();
		},
		onError: (error) => {
			setActionSuccess(null);
			setActionError(getErrorMessage(error));
		}
	});

	const voidInvoiceMutation = useMutation({
		mutationFn: (targetInvoiceId: string) =>
			apiFetch(`/invoices/${targetInvoiceId}/void`, {
				method: "POST",
				body: JSON.stringify({})
			}),
		onSuccess: async () => {
			setActionError(null);
			setActionSuccess("Invoice voided.");
			await refreshInvoiceData();
		},
		onError: (error) => {
			setActionSuccess(null);
			setActionError(getErrorMessage(error));
		}
	});

	const isActionPending =
		createInvoiceMutation.isPending ||
		markAsSentMutation.isPending ||
		markAsPaidMutation.isPending ||
		voidInvoiceMutation.isPending;

	const invoice = invoiceDetailQuery.data?.invoice ?? null;

	const overdueDays = (() => {
		if (!invoice?.dueDate) return null;
		const due = parseDate(invoice.dueDate);
		if (!due) return null;

		const now = new Date();
		const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		const dueStart = new Date(due.getFullYear(), due.getMonth(), due.getDate());
		const diffMs = todayStart.getTime() - dueStart.getTime();
		if (diffMs <= 0) return null;
		return Math.floor(diffMs / (1000 * 60 * 60 * 24));
	})();

	const showPayOrVoidActions =
		invoice?.status === "sent" ||
		invoice?.status === "overdue" ||
		invoice?.status === "partial";

	if (invoiceListQuery.isLoading || (invoiceId && invoiceDetailQuery.isLoading)) {
		return (
			<div className="h-full flex items-center justify-center gap-2 text-sm text-text-tertiary">
				<Loader2 className="w-4 h-4 animate-spin" />
				Loading invoice...
			</div>
		);
	}

	if (invoiceListQuery.isError || invoiceDetailQuery.isError) {
		const message = invoiceListQuery.error
			? getErrorMessage(invoiceListQuery.error)
			: getErrorMessage(invoiceDetailQuery.error);

		return (
			<div className="rounded-xl border border-destructive-foreground/30 bg-destructive-background/10 p-4">
				<p className="text-sm text-destructive-text">{message}</p>
				<p className="mt-1 text-xs text-destructive-text/90">
					Invoice data failed to load from the backend. If this persists, restart
					the backend and run database migrations.
				</p>
				<button
					type="button"
					onClick={() => {
						setActionError(null);
						setActionSuccess(null);
						void invoiceListQuery.refetch();
						if (invoiceId) {
							void invoiceDetailQuery.refetch();
						}
					}}
					className="mt-3 inline-flex items-center rounded-lg border border-background-secondary px-3 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-secondary"
				>
					Retry
				</button>
			</div>
		);
	}

	if (!invoiceId || !invoice) {
		return (
			<div className="rounded-xl border border-dashed border-background-secondary bg-background-main/30 p-6 text-center">
				<p className="text-sm font-medium text-text-main">No invoice created yet</p>
				<p className="mt-1 text-xs text-text-tertiary">
					Create an invoice to track billing for this job.
				</p>
				<button
					type="button"
					disabled={isActionPending || !customerId}
					onClick={() => {
						setActionError(null);
						setActionSuccess(null);
						void createInvoiceMutation.mutateAsync();
					}}
					className="mt-5 inline-flex items-center justify-center rounded-lg bg-accent-main px-4 py-2 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
				>
					{createInvoiceMutation.isPending ? "Creating..." : "Create Invoice"}
				</button>
				{!customerId ? (
					<p className="mt-3 text-xs text-warning-foreground">
						This job is missing a resolvable customer ID, so invoice creation is
						disabled.
					</p>
				) : null}
				{actionError ? (
					<p className="mt-3 text-xs text-destructive-text">{actionError}</p>
				) : null}
				{actionSuccess ? (
					<p className="mt-3 text-xs text-success-text">{actionSuccess}</p>
				) : null}
			</div>
		);
	}

	const lineItems = invoice.lineItems ?? [];

	return (
		<div className="space-y-4">
			<InvoiceTimeline status={invoice.status} />

			<div className="flex items-start justify-between gap-3 rounded-xl border border-background-secondary bg-background-main/40 p-4">
				<div>
					<p className="text-xs uppercase tracking-wide text-text-tertiary">Invoice</p>
					<h4 className="mt-1 text-lg font-semibold text-text-main">
						{invoice.invoiceNumber}
					</h4>
				</div>
				<div className="flex flex-col items-end gap-2">
					<span
						className={cn(
							"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
							STATUS_STYLES[invoice.status]
						)}
					>
						{toStatusLabel(invoice.status)}
					</span>
					<Link
						href={`/documents/${invoice.id}`}
						className="inline-flex items-center gap-1 rounded-lg border border-background-secondary px-2.5 py-1.5 text-xs font-medium text-text-secondary transition-colors hover:bg-background-secondary"
					>
						View Full Invoice
						<ExternalLink className="w-3.5 h-3.5" />
					</Link>
				</div>
			</div>

			<div className="rounded-xl border border-background-secondary bg-background-main/30 p-4">
				<p className="text-xs uppercase tracking-wide text-text-tertiary">
					Total Amount
				</p>
				<p className="mt-2 text-3xl font-semibold text-text-main">
					{formatCurrency(invoice.total)}
				</p>
			</div>

			<div className="grid grid-cols-1 gap-3 rounded-xl border border-background-secondary bg-background-main/30 p-4 text-sm text-text-secondary">
				<div className="flex items-center justify-between gap-3">
					<span className="text-text-tertiary">Issue Date</span>
					<span className="font-medium text-text-main">
						{formatReadableDate(invoice.issueDate)}
					</span>
				</div>
				<div className="flex items-center justify-between gap-3">
					<span className="text-text-tertiary">Due Date</span>
					<span className="font-medium text-text-main">
						{formatReadableDate(invoice.dueDate)}
					</span>
				</div>
				{overdueDays ? (
					<div className="flex items-center justify-between gap-3">
						<span className="text-destructive-text">Overdue</span>
						<span className="font-semibold text-destructive-text">
							{overdueDays} day{overdueDays === 1 ? "" : "s"} overdue
						</span>
					</div>
				) : null}
			</div>

			<div className="rounded-xl border border-background-secondary bg-background-main/30 p-4">
				<p className="text-xs uppercase tracking-wide text-text-tertiary">
					Line Items
				</p>
				{lineItems.length === 0 ? (
					<p className="mt-2 text-sm text-text-tertiary">No line items found.</p>
				) : (
					<ul className="mt-3 space-y-2">
						{lineItems.map((line) => {
							const lineTotal = toNumber(line.quantity) * toNumber(line.unitPrice);
							return (
								<li
									key={line.id}
									className="flex items-start justify-between gap-3 rounded-lg border border-background-secondary/60 px-3 py-2"
								>
									<p className="text-sm text-text-main">
										{line.description?.trim() || line.name}
									</p>
									<p className="text-sm font-medium text-text-main">
										{formatCurrency(lineTotal)}
									</p>
								</li>
							);
						})}
					</ul>
				)}
			</div>

			<div className="rounded-xl border border-background-secondary bg-background-main/30 p-4">
				<p className="text-xs uppercase tracking-wide text-text-tertiary">Notes</p>
				<p className="mt-2 whitespace-pre-wrap text-sm text-text-main">
					{invoice.notes?.trim() || "No notes provided."}
				</p>
			</div>

			<div className="flex flex-wrap items-center gap-2">
				{invoice.status === "draft" ? (
					<>
						<Link
							href={`/documents/${invoice.id}?mode=edit`}
							className="inline-flex items-center rounded-lg border border-background-secondary px-3 py-2 text-sm font-medium text-text-secondary transition-colors hover:bg-background-secondary"
						>
							Edit Invoice
						</Link>
						<button
							type="button"
							disabled={isActionPending}
							onClick={() => {
								setActionError(null);
								setActionSuccess(null);
								void markAsSentMutation.mutateAsync(invoice.id);
							}}
							className="inline-flex items-center rounded-lg bg-accent-main px-3 py-2 text-sm font-medium text-white hover:bg-accent-text transition-colors disabled:cursor-not-allowed disabled:opacity-60"
						>
							Mark as Sent
						</button>
					</>
				) : null}

				{showPayOrVoidActions ? (
					<>
						<button
							type="button"
							disabled={isActionPending}
							onClick={() => {
								setActionError(null);
								setActionSuccess(null);
								void markAsPaidMutation.mutateAsync(invoice);
							}}
							className="inline-flex items-center rounded-lg bg-success-foreground px-3 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
						>
							Mark as Paid
						</button>
						<button
							type="button"
							disabled={isActionPending}
							onClick={() => {
								setActionError(null);
								setActionSuccess(null);
								void voidInvoiceMutation.mutateAsync(invoice.id);
							}}
							className="inline-flex items-center rounded-lg border border-destructive-foreground/40 px-3 py-2 text-sm font-medium text-destructive-text transition-colors hover:bg-destructive-background/20 disabled:cursor-not-allowed disabled:opacity-60"
						>
							Void
						</button>
					</>
				) : null}

			</div>

			{actionError ? (
				<p className="text-xs text-destructive-text">{actionError}</p>
			) : null}
			{actionSuccess ? (
				<p className="text-xs text-success-text">{actionSuccess}</p>
			) : null}
		</div>
	);
}

function stripForLineItemDescription(address: string): string {
	return address.replace(/\s*\b\d{5}(?:-\d{4})?\b\s*$/, "").trim();
}
