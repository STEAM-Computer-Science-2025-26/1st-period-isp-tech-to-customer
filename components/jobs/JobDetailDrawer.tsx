"use client";

import { useEffect, useState } from "react";
import { AlertCircle, ExternalLink, Loader2, X } from "lucide-react";
import { cn, formatPhoneNumber, formatReadableDateTime } from "@/lib/utils";
import { useJob } from "@/lib/hooks/useJob";
import {
	PriorityBadge,
	StatusBadge,
	stripZipCode
} from "@/components/panels/JobDetailPanel";
import { InvoiceTab } from "./InvoiceTab";

type DrawerTab = "details" | "invoice";

const TABS: Array<{ key: DrawerTab; label: string }> = [
	{ key: "details", label: "Details" },
	{ key: "invoice", label: "Invoice" }
];

export function JobDetailDrawer({
	jobId,
	customerId,
	onOpenFull,
	onClose
}: {
	jobId: string | null;
	customerId: string | null;
	onOpenFull: () => void;
	onClose: () => void;
}) {
	const { data: job, isLoading, error, refetch, isFetching } = useJob(jobId);
	const [activeTab, setActiveTab] = useState<DrawerTab>("details");

	useEffect(() => {
		setActiveTab("details");
	}, [jobId]);

	if (!jobId) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Select a job to view details.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center gap-2 p-5 text-sm text-text-tertiary">
				<Loader2 className="w-4 h-4 animate-spin" />
				Loading job details...
			</div>
		);
	}

	if (error || !job) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-5 gap-3 text-sm text-destructive-text">
				<AlertCircle className="w-5 h-5" />
				<p>Failed to load job details.</p>
				<button
					type="button"
					onClick={() => void refetch()}
					className="px-3 py-1.5 rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
				>
					Retry
				</button>
			</div>
		);
	}

	return (
		<div className="h-full flex flex-col">
			<div className="border-b border-background-secondary px-4 py-4">
				<div className="flex items-start justify-between gap-2">
					<div className="min-w-0">
						<p className="text-xs text-text-tertiary uppercase tracking-wide">
							Job
						</p>
						<h3 className="mt-1 text-sm font-semibold text-text-main truncate">
							{job.customerName}
						</h3>
						<p className="mt-0.5 text-xs text-text-tertiary truncate">
							{stripZipCode(job.address)}
						</p>
					</div>
					<div className="flex items-center gap-2">
						<button
							type="button"
							onClick={onOpenFull}
							className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
							title="Open full page"
						>
							<ExternalLink className="w-4 h-4" />
						</button>
						<button
							type="button"
							onClick={onClose}
							className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
							title="Close drawer"
						>
							<X className="w-4 h-4" />
						</button>
					</div>
				</div>

				<div className="mt-3 flex items-center gap-2 flex-wrap">
					<StatusBadge status={job.status} />
					<PriorityBadge priority={job.priority} />
				</div>

				<div className="mt-4 rounded-lg border border-background-secondary p-1 grid grid-cols-2 gap-1 bg-background-main/30">
					{TABS.map((tab) => (
						<button
							key={tab.key}
							type="button"
							onClick={() => setActiveTab(tab.key)}
							className={cn(
								"rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
								activeTab === tab.key
									? "bg-accent-main/15 text-accent-text"
									: "text-text-tertiary hover:bg-background-secondary/70 hover:text-text-main"
							)}
						>
							{tab.label}
						</button>
					))}
				</div>
			</div>

			<div className="flex-1 min-h-0 overflow-y-auto p-4">
				{activeTab === "details" ? (
					<div className="space-y-3">
						<InfoRow label="Customer" value={job.customerName} />
						<InfoRow label="Phone" value={formatPhoneNumber(job.phone)} />
						<InfoRow
							label="Job Type"
							value={job.jobType.replaceAll("_", " ")}
						/>
						<InfoRow label="Address" value={stripZipCode(job.address)} />
						<InfoRow
							label="Scheduled"
							value={formatReadableDateTime(job.scheduledTime)}
						/>
						<InfoRow
							label="Created"
							value={formatReadableDateTime(job.createdAt)}
						/>
						<div className="rounded-xl border border-background-secondary bg-background-main/30 p-4">
							<p className="text-xs uppercase tracking-wide text-text-tertiary">
								Notes
							</p>
							<p className="mt-2 text-sm text-text-main whitespace-pre-wrap">
								{job.initialNotes?.trim() || "No notes added."}
							</p>
						</div>
					</div>
				) : null}

				{activeTab === "invoice" ? (
					<InvoiceTab job={job} customerId={customerId} />
				) : null}
			</div>

			{isFetching ? (
				<div className="border-t border-background-secondary px-4 py-2 text-xs text-text-tertiary">
					Refreshing job data...
				</div>
			) : null}
		</div>
	);
}

function InfoRow({ label, value }: { label: string; value: string }) {
	return (
		<div className="rounded-xl border border-background-secondary bg-background-main/30 p-4">
			<p className="text-xs uppercase tracking-wide text-text-tertiary">
				{label}
			</p>
			<p className="mt-1.5 text-sm capitalize text-text-main">{value}</p>
		</div>
	);
}
