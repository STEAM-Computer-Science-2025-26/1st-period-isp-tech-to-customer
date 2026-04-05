"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Pencil, Plus, X, Check } from "lucide-react";
import MainContent from "@/components/layout/MainContent";
import { apiFetch } from "@/lib/api";
import { cn, formatReadableDate } from "@/lib/utils";
import { KpiCard } from "@/components/ui/Card";
import CustomSelect, { type SelectOption } from "@/components/ui/CustomSelect";
import {
	InvoiceTimeline,
	type InvoiceTimelineStatus
} from "@/components/jobs/InvoiceTimeline";
import type { Job } from "@/lib/schemas/jobSchemas";

type InvoiceLineItem = {
	id: string;
	itemType: "labor" | "part" | "bundle" | "custom";
	name: string;
	description?: string | null;
	quantity: number | string;
	unitPrice: number | string;
	taxable: boolean;
	sortOrder?: number;
};

type InvoiceDetail = {
	id: string;
	invoiceNumber: string;
	status: InvoiceTimelineStatus;
	jobId?: string | null;
	taxRate: number | string;
	total: number | string;
	amountPaid: number | string;
	balanceDue: number | string;
	issueDate?: string | null;
	dueDate?: string | null;
	notes?: string | null;
	customerName?: string | null;
	lineItems?: InvoiceLineItem[];
	updatedAt?: string | null;
};

type InvoiceDetailResponse = {
	invoice: InvoiceDetail;
};

type JobResponse = {
	job: Job;
};

type EditableInvoiceStatus = Exclude<InvoiceTimelineStatus, "overdue">;

type EditableLineItem = {
	itemType: "labor" | "part" | "bundle" | "custom";
	name: string;
	description: string;
	quantity: string;
	unitPrice: string;
	taxable: boolean;
	sortOrder: number;
};

type InvoiceEditDraft = {
	status: EditableInvoiceStatus;
	dueDate: string;
	taxRate: string;
	notes: string;
	lineItems: EditableLineItem[];
};

const CURRENCY_FORMATTER = new Intl.NumberFormat("en-US", {
	style: "currency",
	currency: "USD"
});

const STATUS_STYLES: Record<InvoiceTimelineStatus, string> = {
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

const EDITABLE_STATUS_OPTIONS: SelectOption<EditableInvoiceStatus>[] = [
	{ value: "draft", label: "Draft" },
	{ value: "sent", label: "Sent" },
	{ value: "partial", label: "Partial" },
	{ value: "paid", label: "Paid" },
	{ value: "void", label: "Void" }
];

const LINE_ITEM_TYPE_OPTIONS: SelectOption<EditableLineItem["itemType"]>[] = [
	{ value: "labor", label: "Labor" },
	{ value: "part", label: "Part" },
	{ value: "bundle", label: "Bundle" },
	{ value: "custom", label: "Custom" }
];

function toNumber(value: number | string | null | undefined): number {
	const parsed = Number(value);
	return Number.isFinite(parsed) ? parsed : 0;
}

function formatCurrency(value: number | string | null | undefined): string {
	return CURRENCY_FORMATTER.format(toNumber(value));
}

function toStatusLabel(status: InvoiceTimelineStatus): string {
	if (status === "partial") return "Partially Paid";
	if (status === "overdue") return "Overdue";
	return status.charAt(0).toUpperCase() + status.slice(1);
}

function toEditableStatus(status: InvoiceTimelineStatus): EditableInvoiceStatus {
	return status === "overdue" ? "sent" : status;
}

function normalizeDateInput(value?: string | null): string {
	if (!value) return "";
	return value.slice(0, 10);
}

function stripZipCode(address: string): string {
	return address.replace(/\s*\b\d{5}(?:-\d{4})?\b\s*$/, "").trim();
}

function createDraft(invoice: InvoiceDetail): InvoiceEditDraft {
	return {
		status: toEditableStatus(invoice.status),
		dueDate: normalizeDateInput(invoice.dueDate),
		taxRate: String(toNumber(invoice.taxRate)),
		notes: invoice.notes ?? "",
		lineItems: (invoice.lineItems ?? []).map((line, index) => ({
			itemType: line.itemType,
			name: line.name,
			description: line.description ?? "",
			quantity: String(toNumber(line.quantity)),
			unitPrice: String(toNumber(line.unitPrice)),
			taxable: Boolean(line.taxable),
			sortOrder: line.sortOrder ?? index
		}))
	};
}

function toLineItemsPayload(lineItems: EditableLineItem[]): Array<{
	itemType: "labor" | "part" | "bundle" | "custom";
	name: string;
	description?: string;
	quantity: number;
	unitPrice: number;
	taxable: boolean;
	sortOrder: number;
}> {
	return lineItems.map((line, index) => ({
		itemType: line.itemType,
		name: line.name.trim(),
		description: line.description.trim() || undefined,
		quantity: Math.max(0.01, toNumber(line.quantity)),
		unitPrice: Math.max(0, toNumber(line.unitPrice)),
		taxable: line.taxable,
		sortOrder: line.sortOrder ?? index
	}));
}

function getErrorMessage(error: unknown): string {
	if (error instanceof Error) return error.message;
	return "An unexpected error occurred while saving changes.";
}

export default function InvoiceDocumentPage() {
	const params = useParams<{ invoiceId: string }>();
	const searchParams = useSearchParams();
	const queryClient = useQueryClient();
	const invoiceId = params?.invoiceId ?? "";
	const requestedEditMode = searchParams.get("mode") === "edit";
	const [isEditing, setIsEditing] = useState(requestedEditMode);
	const [draft, setDraft] = useState<InvoiceEditDraft | null>(null);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
	const [syncError, setSyncError] = useState<string | null>(null);
	const [syncSuccess, setSyncSuccess] = useState<string | null>(null);

	const invoiceQuery = useQuery({
		queryKey: ["documents-invoice", invoiceId],
		enabled: !!invoiceId,
		queryFn: () =>
			apiFetch<InvoiceDetailResponse>(`/invoices/${encodeURIComponent(invoiceId)}`)
	});

	const invoice = invoiceQuery.data?.invoice ?? null;
	const lineItems = invoice?.lineItems ?? [];

	const jobQuery = useQuery({
		queryKey: ["invoice-job-details", invoice?.jobId],
		enabled: !!invoice?.jobId,
		queryFn: () => apiFetch<JobResponse>(`/jobs/${encodeURIComponent(invoice!.jobId!)}`)
	});

	const currentJobAddress = jobQuery.data?.job?.address
		? stripZipCode(jobQuery.data.job.address)
		: "";

	const invoiceAddressSnapshot =
		(lineItems[0]?.description ?? lineItems[0]?.name ?? "").trim();

	const showInvoiceSyncPrompt = Boolean(
		invoice?.jobId &&
			currentJobAddress &&
			invoiceAddressSnapshot &&
			currentJobAddress !== invoiceAddressSnapshot
	);

	const canEditLineItems = invoice?.status === "draft";

	useEffect(() => {
		if (requestedEditMode) {
			setIsEditing(true);
		}
	}, [requestedEditMode]);

	useEffect(() => {
		if (!invoice) return;
		setDraft(createDraft(invoice));
	}, [invoice]);

	const saveInvoiceMutation = useMutation({
		mutationFn: async () => {
			if (!invoice || !draft) return;

			const patchPayload: Record<string, unknown> = {
				status: draft.status,
				dueDate: draft.dueDate || undefined,
				notes: draft.notes || undefined,
				taxRate: toNumber(draft.taxRate)
			};

			if (canEditLineItems) {
				const payload = toLineItemsPayload(draft.lineItems);
				if (payload.length === 0) {
					throw new Error("Invoices must include at least one line item.");
				}

				await apiFetch(`/invoices/${invoice.id}/line-items`, {
					method: "PUT",
					body: JSON.stringify({ lineItems: payload })
				});
			}

			await apiFetch(`/invoices/${invoice.id}`, {
				method: "PATCH",
				body: JSON.stringify(patchPayload)
			});
		},
		onSuccess: async () => {
			setSaveError(null);
			setSaveSuccess("Invoice updated successfully.");
			setIsEditing(false);
			await queryClient.invalidateQueries({
				queryKey: ["documents-invoice", invoiceId]
			});
		},
		onError: (error) => {
			setSaveSuccess(null);
			setSaveError(getErrorMessage(error));
		}
	});

	const syncAddressMutation = useMutation({
		mutationFn: async () => {
			if (!invoice || !currentJobAddress) return;
			if (invoice.status !== "draft") {
				throw new Error(
					"Address sync can only update draft invoices because line items are locked after sending."
				);
			}

			const nextLineItems: EditableLineItem[] = (invoice.lineItems ?? []).map(
				(line, index) => ({
					itemType: line.itemType,
					name: line.name,
					description:
						index === 0
							? currentJobAddress
							: (line.description ?? ""),
					quantity: String(toNumber(line.quantity)),
					unitPrice: String(toNumber(line.unitPrice)),
					taxable: Boolean(line.taxable),
					sortOrder: line.sortOrder ?? index
				})
			);

			await apiFetch(`/invoices/${invoice.id}/line-items`, {
				method: "PUT",
				body: JSON.stringify({ lineItems: toLineItemsPayload(nextLineItems) })
			});
		},
		onSuccess: async () => {
			setSyncError(null);
			setSyncSuccess("Invoice address updated from current job details.");
			await queryClient.invalidateQueries({
				queryKey: ["documents-invoice", invoiceId]
			});
		},
		onError: (error) => {
			setSyncSuccess(null);
			setSyncError(getErrorMessage(error));
		}
	});

	const resetDraft = () => {
		if (!invoice) return;
		setDraft(createDraft(invoice));
		setIsEditing(false);
		setSaveError(null);
		setSaveSuccess(null);
	};

	const updateDraftLineItem = (
		index: number,
		updates: Partial<EditableLineItem>
	) => {
		setDraft((current) => {
			if (!current) return current;
			return {
				...current,
				lineItems: current.lineItems.map((line, lineIndex) =>
					lineIndex === index ? { ...line, ...updates } : line
				)
			};
		});
	};

	const updateDraftLineItemType = (
		index: number,
		value: EditableLineItem["itemType"]
	) => {
		updateDraftLineItem(index, { itemType: value });
	};

	const addDraftLineItem = () => {
		setDraft((current) => {
			if (!current) return current;
			return {
				...current,
				lineItems: [
					...current.lineItems,
					{
						itemType: "custom",
						name: "",
						description: "",
						quantity: "1",
						unitPrice: "0",
						taxable: true,
						sortOrder: current.lineItems.length
					}
				]
			};
		});
	};

	const removeDraftLineItem = (index: number) => {
		setDraft((current) => {
			if (!current || current.lineItems.length <= 1) return current;
			return {
				...current,
				lineItems: current.lineItems.filter((_, lineIndex) => lineIndex !== index)
			};
		});
	};

	return (
		<MainContent headerTitle="Invoices" className="max-w-4xl mx-auto py-6 px-3 sm:px-5">
			{invoiceQuery.isLoading ? (
				<div className="rounded-xl border border-background-secondary p-6 flex items-center gap-2 text-sm text-text-tertiary">
					<Loader2 className="w-4 h-4 animate-spin" />
					Loading invoice...
				</div>
			) : null}

			{invoiceQuery.isError ? (
				<div className="rounded-xl border border-destructive-foreground/30 bg-destructive-background/10 p-6">
					<h1 className="text-lg font-semibold text-destructive-text">
						Unable to load invoice
					</h1>
					<p className="mt-2 text-sm text-destructive-text/90">
						The invoice could not be loaded right now. Try again in a moment.
					</p>
				</div>
			) : null}

			{invoice ? (
				<div className="space-y-4">
					<InvoiceTimeline className="px-5" status={invoice.status} />

					{showInvoiceSyncPrompt ? (
						<div className="rounded-xl border border-warning-foreground/30 bg-warning-background/20 p-4">
							<p className="text-sm font-medium text-warning-foreground">
								Job details were updated. Do you want to update invoice details?
							</p>
							<p className="mt-1 text-xs text-text-secondary">
								Current job address differs from the invoice snapshot.
							</p>
							<div className="mt-3 flex items-center gap-2">
								<button
									type="button"
									onClick={() => {
										setSyncError(null);
										setSyncSuccess(null);
										void syncAddressMutation.mutateAsync();
									}}
									disabled={syncAddressMutation.isPending}
									className="inline-flex items-center rounded-lg border border-warning-foreground/35 px-3 py-1.5 text-xs font-semibold text-warning-foreground transition-colors hover:bg-warning-background/40 disabled:opacity-60 disabled:cursor-not-allowed"
								>
									{syncAddressMutation.isPending
										? "Updating..."
										: "Update Invoice Address"}
								</button>
							</div>
							{syncError ? (
								<p className="mt-2 text-xs text-destructive-text">{syncError}</p>
							) : null}
							{syncSuccess ? (
								<p className="mt-2 text-xs text-success-text">{syncSuccess}</p>
							) : null}
						</div>
					) : null}

					<div className="p-5">
						<div className="flex flex-col items-start justify-between gap-3">
								<div className={cn(`flex flex-row gap-2 items-center w-full`)}>
								<h1 className="text-2xl font-semibold text-text-main mt-1 truncate">
									{invoice.invoiceNumber}
								</h1>
								<span
											className={cn(
												"inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium",
												STATUS_STYLES[invoice.status]
											)}
										>
											{toStatusLabel(invoice.status)}
										</span>
										{isEditing ? (
											<>
												<button
													type="button"
													onClick={() => {
														setSaveError(null);
														setSaveSuccess(null);
														void saveInvoiceMutation.mutateAsync();
													}}
													disabled={saveInvoiceMutation.isPending || !draft}
													className="ml-auto hover:text-text-primary text-text-tertiary/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
												>
													<Check className="w-full aspect-square" />
												</button>
												<button
													type="button"
													onClick={resetDraft}
													disabled={saveInvoiceMutation.isPending}
													className="hover:text-destructive-text/70 text-text-tertiary/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
												>
													<X className="w-full aspect-square" />
												</button>
											</>
										) : (
											<button
												type="button"
												onClick={() => setIsEditing(true)}
												className="ml-auto hover:text-text-primary h-5 w-5 text-text-tertiary/70 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
												>
													<Pencil className="w-full aspect-square" />
											</button>
										)}
						</div>

								{saveError ? (
									<p className="mt-3 text-xs text-destructive-text">{saveError}</p>
								) : null}
								{saveSuccess ? (
									<p className="mt-3 text-xs text-success-text">{saveSuccess}</p>
								) : null}
										</div>
								{invoice.customerName ? (
									<p className="mt-1 text-sm text-text-secondary">
										{invoice.customerName}
									</p>
								) : null}
							</div>
									<div className=" w-full px-5">

						<div className="mt-5 grid grid-cols-1 sm:grid-cols-3 gap-3">
							<KpiCard
								title="Total"
								value={formatCurrency(invoice.total)}
								className="border h-24 border-background-secondary bg-background-main/30"
							/>
							<KpiCard
								title="Amount Received"
								value={formatCurrency(invoice.amountPaid)}
								className="border h-24 border-background-secondary bg-background-main/30"
							/>
							<KpiCard
								title="Remaining"
								value={formatCurrency(invoice.balanceDue)}
								className="border h-24 border-background-secondary bg-background-main/30"
							/>
						</div>

						{isEditing && draft ? (
							<div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3">
								<label className="flex flex-col gap-1 text-xs text-text-tertiary">
									Status
									<CustomSelect
										value={draft.status}
										options={EDITABLE_STATUS_OPTIONS}
										onChange={(value) =>
											setDraft((current) =>
												current ? { ...current, status: value } : current
											)
										}
										buttonClassName="w-full justify-between px-2.5 py-2 text-sm"
										menuClassName="w-full"
									/>
								</label>

								<label className="flex flex-col gap-1 text-xs text-text-tertiary">
									Due Date
									<input
										type="date"
										value={draft.dueDate}
										onChange={(event) =>
											setDraft((current) =>
												current
													? { ...current, dueDate: event.target.value }
													: current
											)
										}
										className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-sm text-text-main"
									/>
								</label>

								<label className="flex flex-col gap-1 text-xs text-text-tertiary">
									Tax Rate
									<input
										type="number"
										step="0.0001"
										min="0"
										max="1"
										value={draft.taxRate}
										onChange={(event) =>
											setDraft((current) =>
												current
													? { ...current, taxRate: event.target.value }
													: current
											)
										}
										className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-sm text-text-main"
									/>
								</label>

								<label className="sm:col-span-2 flex flex-col gap-1 text-xs text-text-tertiary">
									Notes
									<textarea
										rows={4}
										value={draft.notes}
										onChange={(event) =>
											setDraft((current) =>
												current
													? { ...current, notes: event.target.value }
													: current
											)
										}
										className="rounded-lg resize-none border border-background-secondary bg-background-main px-2.5 py-2 text-sm text-text-main"
									/>
								</label>
							</div>
						) : (
							<div className="mt-5 grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
								<InfoRow
									label="Issue Date"
									value={formatReadableDate(invoice.issueDate)}
								/>
								<InfoRow
									label="Due Date"
									value={formatReadableDate(invoice.dueDate)}
								/>
							</div>
						)}
					</div>

					<div className="px-7">
						<div className="flex items-center justify-between gap-2 -mx-2 mb-1">
							<h2 className="text-sm font-semibold text-text-main">Line Items</h2>
							{isEditing && canEditLineItems ? (
								<button
									type="button"
									onClick={addDraftLineItem}
									className="inline-flex items-center gap-1 rounded-lg border border-background-secondary px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:bg-background-secondary"
								>
									<Plus className="w-3.5 h-3.5" />
									Add Line
								</button>
							) : null}
						</div>

						{isEditing && draft ? (
							<div className="-mx-2 space-y-3">
								{!canEditLineItems ? (
									<p className="text-xs text-text-secondary">
										Line items can only be edited while the invoice is in draft.
									</p>
								) : null}

								{draft.lineItems.map((line, index) => (
									<div
										key={`line-${index}`}
										className="rounded-lg border border-background-secondary/70 px-3 py-2 space-y-2"
									>
										<div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
											<label className="flex flex-col gap-1 text-xs text-text-tertiary">
												Name
												<input
													value={line.name}
													disabled={!canEditLineItems}
													onChange={(event) =>
														updateDraftLineItem(index, { name: event.target.value })
													}
													className="rounded-md border border-background-secondary bg-background-main px-2.5 py-1.5 text-sm text-text-main disabled:opacity-60"
												/>
											</label>

											<label className="flex flex-col gap-1 text-xs text-text-tertiary">
												Type
												{canEditLineItems ? (
													<CustomSelect
														value={line.itemType}
														options={LINE_ITEM_TYPE_OPTIONS}
														onChange={(value) => updateDraftLineItemType(index, value)}
														buttonClassName="w-full justify-between px-2.5 py-1.5 text-sm"
														menuClassName="w-full"
													/>
												) : (
													<div className="rounded-md border border-background-secondary bg-background-main px-2.5 py-1.5 text-sm text-text-main capitalize opacity-60">
														{line.itemType}
													</div>
												)}
											</label>
										</div>

										<label className="flex flex-col gap-1 text-xs text-text-tertiary">
											Description
											<input
												value={line.description}
												disabled={!canEditLineItems}
												onChange={(event) =>
													updateDraftLineItem(index, {
														description: event.target.value
													})
												}
												className="rounded-md border border-background-secondary bg-background-main px-2.5 py-1.5 text-sm text-text-main disabled:opacity-60"
											/>
										</label>

										<div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
											<label className="flex flex-col gap-1 text-xs text-text-tertiary">
												Quantity
												<input
													type="number"
													step="0.01"
													min="0.01"
													value={line.quantity}
													disabled={!canEditLineItems}
													onChange={(event) =>
														updateDraftLineItem(index, {
															quantity: event.target.value
														})
													}
													className="rounded-md border border-background-secondary bg-background-main px-2.5 py-1.5 text-sm text-text-main disabled:opacity-60"
												/>
											</label>

											<label className="flex flex-col gap-1 text-xs text-text-tertiary">
												Unit Price
												<input
													type="number"
													step="0.01"
													min="0"
													value={line.unitPrice}
													disabled={!canEditLineItems}
													onChange={(event) =>
														updateDraftLineItem(index, {
															unitPrice: event.target.value
														})
													}
													className="rounded-md border border-background-secondary bg-background-main px-2.5 py-1.5 text-sm text-text-main disabled:opacity-60"
												/>
											</label>

											<label className="flex items-center gap-2 text-xs text-text-tertiary mt-5 sm:mt-0">
												<input
													type="checkbox"
													checked={line.taxable}
													disabled={!canEditLineItems}
													onChange={(event) =>
														updateDraftLineItem(index, {
															taxable: event.target.checked
														})
													}
												/>
												Taxable
											</label>
										</div>

										{canEditLineItems ? (
											<div className="flex justify-end">
												<button
													type="button"
													onClick={() => removeDraftLineItem(index)}
													disabled={draft.lineItems.length <= 1}
													className="text-xs font-semibold text-destructive-text disabled:opacity-40"
												>
													Remove Line
												</button>
											</div>
										) : null}
									</div>
								))}
							</div>
						) : lineItems.length === 0 ? (
							<p className="mt-2 text-sm text-text-tertiary">No line items found.</p>
						) : (
							<ul className="mt-3 space-y-2">
								{lineItems.map((line) => {
									const total = toNumber(line.quantity) * toNumber(line.unitPrice);
									return (
										<li
											key={line.id}
											className="rounded-lg border border-background-secondary/70 px-3 py-2 flex items-start justify-between gap-3"
										>
											<div>
												<p className="text-sm text-text-main">
													{line.description?.trim() || line.name}
												</p>
											</div>
											<p className="text-sm font-medium text-text-main">
												{formatCurrency(total)}
											</p>
										</li>
									);
								})}
							</ul>
						)}
					</div>

					<div className="px-7">
						{!isEditing && (
							<>
						<h2 className="text-sm font-semibold text-text-main">Notes</h2>
							<p className="mt-2 whitespace-pre-wrap text-sm text-text-secondary border border-text-secondary/30 rounded-lg px-3 py-2.5">
								{invoice.notes?.trim() || "No notes provided."}
							</p>
							</>
						)}
					</div>
				</div>
			) : null}
		</MainContent>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-lg bg-background-main/30 px-3 sm:flex flex-row items-row sm:items-center sm:gap-2">
			<p className="text-xs pt-0.75 sm:h-full uppercase tracking-wide text-text-tertiary">{label}</p>
			<p className="sm:h-full text-sm font-medium text-text-main">{value}</p>
		</div>
	);
}
