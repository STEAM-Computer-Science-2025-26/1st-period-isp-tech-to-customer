"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils/index";
import { formatReadableDateTime, formatPhoneNumber } from "@/lib/utils";
import type { JobDTO } from "@/app/types/types";
import { apiFetch } from "@/lib/api";
import { useJob, useUpdateJob } from "@/lib/hooks/useJob";
import { useOpenToJobOnMap } from "@/lib/hooks/useOpenTo";
import CustomSelect from "@/components/ui/CustomSelect";
import AddressAutocomplete from "@/components/ui/AddressAutocomplete";
import { PopoverDatePicker } from "@/components/ui/DateRangePicker";
import {
	AlertCircle,
	Calendar,
	Check,
	Clock,
	ExternalLink,
	Hammer,
	MapPin,
	Pencil,
	Phone,
	RefreshCw,
	ScanSearch,
	Settings2,
	Wrench,
	X
} from "lucide-react";

export function StatusBadge({ status }: { status: JobDTO["status"] }) {
	const classes: Record<JobDTO["status"], string> = {
		unassigned:
			"bg-background-secondary text-text-tertiary border border-background-secondary",
		assigned:
			"bg-info-background/15 text-info-text border border-info-foreground/30",
		in_progress:
			"bg-accent-main/10 text-accent-text border border-accent-main/30",
		completed:
			"bg-success-background/15 text-success-text border border-success-foreground/30",
		cancelled:
			"bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30"
	};

	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize",
				classes[status]
			)}
		>
			{status.replaceAll("_", " ")}
		</span>
	);
}

export function PriorityBadge({ priority }: { priority: JobDTO["priority"] }) {
	const classes: Record<JobDTO["priority"], string> = {
		low: "text-text-secondary",
		medium: "text-accent-text",
		high: "text-warning-foreground",
		emergency: "text-destructive-foreground"
	};

	return (
		<span className={cn("text-xs font-semibold capitalize", classes[priority])}>
			{priority}
		</span>
	);
}

export function stripZipCode(address: string): string {
	return address.replace(/\s*\b\d{5}(?:-\d{4})?\b\s*$/, "").trim();
}

function parseTimeFromISO(iso: string): string {
	if (!iso) return "";
	const d = new Date(iso);
	if (isNaN(d.getTime())) return "";
	return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function applyTimeToISO(dateISO: string, time: string): string {
	if (!dateISO) return "";
	const [h = 0, m = 0] = time.split(":").map(Number);
	const d = new Date(dateISO);
	if (isNaN(d.getTime())) return "";
	d.setHours(h, m, 0, 0);
	return d.toISOString();
}

export function JobDetailPanel({
	jobId,
	onOpenFull
}: {
	jobId: string | null;
	onOpenFull: () => void;
}) {
	const { data: job, isLoading, error, refetch, isFetching } = useJob(jobId);
	const updateJob = useUpdateJob(jobId ?? "");
	const openToJobOnMap = useOpenToJobOnMap();
	const [isEditing, setIsEditing] = useState(false);
	const [saveError, setSaveError] = useState<string | null>(null);
	const [draft, setDraft] = useState({
		customerName: "",
		address: "",
		phone: "",
		jobType: "",
		status: "unassigned" as JobDTO["status"],
		priority: "low" as JobDTO["priority"],
		scheduledTime: "",
		createdAt: "",
		completedAt: "",
		initialNotes: "",
		completionNotes: ""
	});
	const [openPicker, setOpenPicker] = useState<
		"scheduled" | "created" | "completed" | null
	>(null);
	const scheduledRef = useRef<HTMLButtonElement>(null);
	const createdRef = useRef<HTMLButtonElement>(null);
	const completedRef = useRef<HTMLButtonElement>(null);

	useEffect(() => {
		if (!job) return;
		setIsEditing(false);
		setSaveError(null);
		setDraft({
			customerName: job.customerName ?? "",
			address: job.address ?? "",
			phone: formatPhoneNumber(job.phone ?? ""),
			jobType: job.jobType ?? "",
			status: job.status,
			priority: job.priority,
			scheduledTime: job.scheduledTime ?? "",
			createdAt: job.createdAt ?? "",
			completedAt: job.completedAt ?? "",
			initialNotes: job.initialNotes ?? "",
			completionNotes: job.completionNotes ?? ""
		});
	}, [job]);

	if (!jobId) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Select a job to view details.
			</div>
		);
	}

	if (isLoading) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
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
					onClick={() => void refetch()}
					className="px-3 py-1.5 rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
				>
					Retry
				</button>
			</div>
		);
	}

	const displayJob = isEditing ? { ...job, ...draft } : job;

	const handleCancelEdit = () => {
		if (!displayJob) return;
		setSaveError(null);
		setIsEditing(false);
		setDraft({
			customerName: displayJob.customerName ?? "",
			address: displayJob.address ?? "",
			phone: displayJob.phone ?? "",
			jobType: displayJob.jobType ?? "",
			status: displayJob.status,
			priority: displayJob.priority,
			scheduledTime: displayJob.scheduledTime ?? "",
			createdAt: displayJob.createdAt ?? "",
			completedAt: displayJob.completedAt ?? "",
			initialNotes: displayJob.initialNotes ?? "",
			completionNotes: displayJob.completionNotes ?? ""
		});
	};

	const handleSaveEdit = async () => {
		if (!job) return;
		setSaveError(null);
		try {
			const nextPhone = draft.phone.replace(/\D/g, "");
			await updateJob.mutateAsync({
				customerName: draft.customerName,
				address: draft.address,
				phone: nextPhone,
				jobType: draft.jobType as JobDTO["jobType"],
				status: draft.status,
				priority: draft.priority,
				scheduledTime: draft.scheduledTime || undefined,
				initialNotes: draft.initialNotes
			});

			if (draft.completionNotes !== (job.completionNotes ?? "")) {
				await apiFetch(`/jobs/${job.id}/status`, {
					method: "PUT",
					body: JSON.stringify({
						status: draft.status,
						completionNotes: draft.completionNotes || undefined
					})
				});
			}

			await refetch();
			setIsEditing(false);
		} catch (saveEditError) {
			setSaveError(
				saveEditError instanceof Error
					? saveEditError.message
					: "Failed to save job edits"
			);
		}
	};

	return (
		<div className="h-full flex flex-col">
			<div className="px-4 py-3 border-b border-background-secondary flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs mb-1 text-text-tertiary uppercase tracking-wide">
						Job
					</p>
					{isEditing ? (
						<input
							value={draft.customerName}
							onChange={(event) =>
								setDraft((prev) => ({
									...prev,
									customerName: event.target.value
								}))
							}
							className="w-full rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm font-semibold text-text-main focus:outline-none focus:border-accent-main/50"
						/>
					) : (
						<h3 className="text-sm font-semibold text-text-main truncate">
							{displayJob.customerName}
						</h3>
					)}
				</div>
				<div className="flex items-center gap-2">
					<button
						onClick={onOpenFull}
						className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
						title="Open full page"
					>
						<ExternalLink className="w-4 h-4" />
					</button>
					<button
						onClick={() => void refetch()}
						disabled={isFetching}
						className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors disabled:opacity-60"
						title="Refresh details"
					>
						<RefreshCw
							className={cn("w-4 h-4", isFetching && "animate-spin")}
						/>
					</button>
					{isEditing ? (
						<>
							<button
								onClick={() => void handleSaveEdit()}
								disabled={updateJob.isPending}
								className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
								title="Save edits"
							>
								<Check className="w-4 h-4" />
							</button>
							<button
								onClick={handleCancelEdit}
								disabled={updateJob.isPending}
								className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
								title="Cancel edits"
							>
								<X className="w-4 h-4" />
							</button>
						</>
					) : (
						<button
							onClick={() => setIsEditing(true)}
							disabled={updateJob.isPending}
							className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
							title="Edit details"
						>
							<Pencil className="w-4 h-4" />
						</button>
					)}
				</div>
			</div>

			{saveError ? (
				<div className="border-b border-background-secondary px-4 py-2 text-xs text-destructive-text">
					{saveError}
				</div>
			) : null}

			<div className="flex-1 overflow-y-auto p-5 flex flex-col gap-4 min-h-0">
				<div className="flex items-center gap-2 flex-wrap">
					{isEditing ? (
						<>
							<CustomSelect
								value={draft.status}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										status: value as JobDTO["status"]
									}))
								}
								options={[
									{ value: "unassigned", label: "Unassigned" },
									{ value: "assigned", label: "Assigned" },
									{ value: "in_progress", label: "In Progress" },
									{ value: "completed", label: "Completed" },
									{ value: "cancelled", label: "Cancelled" }
								]}
							/>
							<CustomSelect
								value={draft.priority}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										priority: value as JobDTO["priority"]
									}))
								}
								options={[
									{ value: "emergency", label: "Emergency" },
									{ value: "high", label: "High" },
									{ value: "medium", label: "Medium" },
									{ value: "low", label: "Low" }
								]}
							/>
							<CustomSelect
								value={draft.jobType as JobDTO["jobType"]}
								onChange={(value) =>
									setDraft((prev) => ({
										...prev,
										jobType: value
									}))
								}
								options={[
									{
										value: "installation",
										label: "Installation",
										icon: <Hammer className="w-3 h-3" />
									},
									{
										value: "repair",
										label: "Repair",
										icon: <Wrench className="w-3 h-3" />
									},
									{
										value: "maintenance",
										label: "Maintenance",
										icon: <Settings2 className="w-3 h-3" />
									},
									{
										value: "inspection",
										label: "Inspection",
										icon: <ScanSearch className="w-3 h-3" />
									}
								]}
							/>
						</>
					) : (
						<>
							<StatusBadge status={displayJob.status} />
							<PriorityBadge priority={displayJob.priority} />
							<span className="text-xs text-text-tertiary capitalize flex items-center gap-1">
								<Wrench className="w-3 h-3" />
								{displayJob.jobType.replaceAll("_", " ")}
							</span>
						</>
					)}
				</div>

				<div className="space-y-3 text-sm">
					<div className="flex items-start gap-2 text-text-secondary">
						<MapPin className="w-4 h-4 mt-0.5 text-text-tertiary" />
						{isEditing ? (
							<AddressAutocomplete
								value={draft.address}
								onChange={(value) =>
									setDraft((prev) => ({ ...prev, address: value }))
								}
								className="flex-1"
							/>
						) : (
							<button
								type="button"
								onClick={() => openToJobOnMap(displayJob.id)}
								className="text-left cursor-pointer transition-colors hover:text-text-main"
								title="Open this job location on the map"
							>
								{displayJob.address}
							</button>
						)}
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="w-4 h-4 text-text-tertiary" />
						{isEditing ? (
							<input
								value={draft.phone}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										phone: formatPhoneNumber(event.target.value)
									}))
								}
								inputMode="tel"
								placeholder="(555)-123-4567"
								className="flex-1 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm text-text-main focus:outline-none focus:border-accent-main/50"
							/>
						) : (
							<span>{formatPhoneNumber(displayJob.phone ?? "")}</span>
						)}
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Clock className="w-4 h-4 text-text-tertiary" />
						{isEditing ? (
							<>
								<button
									ref={scheduledRef}
									type="button"
									onClick={() =>
										setOpenPicker((p) =>
											p === "scheduled" ? null : "scheduled"
										)
									}
									className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-sm text-text-main hover:border-accent-main/50"
								>
									<span>
										{draft.scheduledTime
											? formatReadableDateTime(draft.scheduledTime)
											: "Not set"}
									</span>
									<Calendar className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
								</button>
								<PopoverDatePicker
									open={openPicker === "scheduled"}
									onOpenChange={(open) =>
										setOpenPicker(open ? "scheduled" : null)
									}
									anchorEl={scheduledRef.current}
									mode="single"
									showHeader={false}
									selection={{ start: draft.scheduledTime || undefined }}
									onChange={({ start }) =>
										setDraft((prev) => ({
											...prev,
											scheduledTime: start
												? applyTimeToISO(
														start,
														parseTimeFromISO(prev.scheduledTime) || "09:00"
													)
												: ""
										}))
									}
									time={parseTimeFromISO(draft.scheduledTime)}
									onTimeChange={(time) =>
										setDraft((prev) => ({
											...prev,
											scheduledTime: prev.scheduledTime
												? applyTimeToISO(prev.scheduledTime, time)
												: ""
										}))
									}
								/>
							</>
						) : (
							<span>
								Scheduled: {formatReadableDateTime(displayJob.scheduledTime)}
							</span>
						)}
					</div>
				</div>

				<div className="space-y-1 text-xs text-text-secondary">
					<div className="text-text-secondary text-xs">
						{isEditing ? (
							<div className="flex items-center gap-2">
								<span className="shrink-0 text-text-tertiary">Created:</span>
								<button
									ref={createdRef}
									type="button"
									onClick={() =>
										setOpenPicker((p) => (p === "created" ? null : "created"))
									}
									className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-xs text-text-main hover:border-accent-main/50"
								>
									<span>
										{draft.createdAt
											? formatReadableDateTime(draft.createdAt)
											: "Not set"}
									</span>
									<Calendar className="w-3 h-3 shrink-0 text-text-tertiary" />
								</button>
								<PopoverDatePicker
									open={openPicker === "created"}
									onOpenChange={(open) =>
										setOpenPicker(open ? "created" : null)
									}
									anchorEl={createdRef.current}
									mode="single"
									showHeader={false}
									selection={{ start: draft.createdAt || undefined }}
									onChange={({ start }) =>
										setDraft((prev) => ({
											...prev,
											createdAt: start
												? applyTimeToISO(
														start,
														parseTimeFromISO(prev.createdAt) || "00:00"
													)
												: ""
										}))
									}
									time={parseTimeFromISO(draft.createdAt)}
									onTimeChange={(time) =>
										setDraft((prev) => ({
											...prev,
											createdAt: prev.createdAt
												? applyTimeToISO(prev.createdAt, time)
												: ""
										}))
									}
								/>
							</div>
						) : (
							<>Created: {formatReadableDateTime(displayJob.createdAt)}</>
						)}
					</div>
					{(displayJob.completedAt || isEditing) && (
						<div className="text-text-secondary text-xs">
							{isEditing ? (
								<div className="flex flex-col gap-2">
									<label className="flex cursor-pointer items-center gap-2">
										<input
											type="checkbox"
											checked={draft.completedAt !== ""}
											onChange={(e) =>
												setDraft((prev) => ({
													...prev,
													completedAt: e.target.checked
														? new Date().toISOString()
														: ""
												}))
											}
											className="accent-accent-main rounded"
										/>
										<span className="text-text-tertiary">Completed</span>
									</label>
									{draft.completedAt !== "" && (
										<div className="flex items-center gap-2">
											<button
												ref={completedRef}
												type="button"
												onClick={() =>
													setOpenPicker((p) =>
														p === "completed" ? null : "completed"
													)
												}
												className="flex flex-1 items-center justify-between gap-2 rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-1 text-xs text-text-main hover:border-accent-main/50"
											>
												<span>{formatReadableDateTime(draft.completedAt)}</span>
												<Calendar className="w-3 h-3 shrink-0 text-text-tertiary" />
											</button>
											<PopoverDatePicker
												open={openPicker === "completed"}
												onOpenChange={(open) =>
													setOpenPicker(open ? "completed" : null)
												}
												anchorEl={completedRef.current}
												mode="single"
												showHeader={false}
												selection={{ start: draft.completedAt || undefined }}
												onChange={({ start }) =>
													setDraft((prev) => ({
														...prev,
														completedAt: start
															? applyTimeToISO(
																	start,
																	parseTimeFromISO(prev.completedAt) || "00:00"
																)
															: ""
													}))
												}
												time={parseTimeFromISO(draft.completedAt)}
												onTimeChange={(time) =>
													setDraft((prev) => ({
														...prev,
														completedAt: prev.completedAt
															? applyTimeToISO(prev.completedAt, time)
															: ""
													}))
												}
											/>
										</div>
									)}
								</div>
							) : (
								<>Completed: {formatReadableDateTime(displayJob.completedAt)}</>
							)}
						</div>
					)}
				</div>

				<div className="rounded-xl flex flex-col gap-2 flex-1 min-h-0">
					<p className="text-xs uppercase tracking-wide text-text-tertiary">
						Notes
					</p>
					{isEditing ? (
						<>
							<textarea
								value={draft.initialNotes}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										initialNotes: event.target.value
									}))
								}
								className="w-full flex-1 resize-none rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-2 text-sm text-text-main"
								placeholder="Initial notes"
							/>
							<textarea
								value={draft.completionNotes}
								onChange={(event) =>
									setDraft((prev) => ({
										...prev,
										completionNotes: event.target.value
									}))
								}
								className="w-full flex-1 resize-none rounded-lg border border-background-secondary bg-background-primary/50 px-2 py-2 text-sm text-text-main"
								placeholder="Completion notes"
							/>
						</>
					) : (
						<>
							<p className="text-sm text-text-secondary whitespace-pre-wrap">
								{displayJob.initialNotes ?? "No initial notes."}
							</p>
							{displayJob.completionNotes && (
								<p className="text-sm text-text-secondary whitespace-pre-wrap border-t border-background-secondary pt-2">
									{displayJob.completionNotes}
								</p>
							)}
						</>
					)}
				</div>
			</div>
		</div>
	);
}
