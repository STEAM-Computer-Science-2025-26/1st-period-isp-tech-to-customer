"use client";

import { useEffect, useState } from "react";
import { useMapsLibrary } from "@vis.gl/react-google-maps";
import { cn } from "@/lib/utils";
import { type MapJob, type MapTech } from "@/lib/schemas/mapSchemas";
import {
	X,
	MapPin,
	Phone,
	Clock,
	Wrench,
	User,
	AlertCircle,
	CheckCircle2,
	Navigation
} from "lucide-react";

// ─── Types ───────────────────────────────────────────────────────────────────

type DriveTime = {
	techId: string;
	techName: string;
	durationText: string;
	distanceText: string;
	durationSeconds: number;
};

type Props = {
	selectedJob: MapJob | null;
	selectedTech: MapTech | null;
	allTechs: MapTech[];
	onClose: () => void;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const PRIORITY_COLORS: Record<MapJob["priority"], string> = {
	emergency: "text-red-400 bg-red-500/10 border-red-500/30",
	high: "text-orange-400 bg-orange-500/10 border-orange-500/30",
	medium: "text-yellow-400 bg-yellow-500/10 border-yellow-500/30",
	low: "text-green-400 bg-green-500/10 border-green-500/30"
};

const STATUS_COLORS: Record<MapJob["status"], string> = {
	unassigned: "text-text-tertiary bg-background-primary border-accent-text/20",
	assigned: "text-blue-400 bg-blue-500/10 border-blue-500/30",
	in_progress: "text-purple-400 bg-purple-500/10 border-purple-500/30"
};

const JOB_TYPE_LABELS: Record<string, string> = {
	installation: "Installation",
	repair: "Repair",
	maintenance: "Maintenance",
	inspection: "Inspection"
};

function Badge({
	children,
	className
}: {
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border",
				className
			)}
		>
			{children}
		</span>
	);
}

function formatTime(iso: string | null) {
	if (!iso) return "Not scheduled";
	return new Date(iso).toLocaleString(undefined, {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

function secondsAgo(secondsSinceUpdate: number | null): string {
	if (secondsSinceUpdate === null) return "Unknown";
	if (secondsSinceUpdate < 60) return `${Math.round(secondsSinceUpdate)}s ago`;
	if (secondsSinceUpdate < 3600)
		return `${Math.round(secondsSinceUpdate / 60)}m ago`;
	return `${Math.round(secondsSinceUpdate / 3600)}h ago`;
}

// ─── Drive time fetcher using Distance Matrix API ─────────────────────────────

function useDriveTimes(
	job: MapJob | null,
	techs: MapTech[]
): { driveTimes: DriveTime[]; loading: boolean } {
	const routesLib = useMapsLibrary("routes");
	const [driveTimes, setDriveTimes] = useState<DriveTime[]>([]);
	const [loading, setLoading] = useState(false);

	useEffect(() => {
		if (!routesLib || !job?.latitude || !job?.longitude) {
			setDriveTimes([]);
			return;
		}

		const availableTechs = techs.filter(
			(t) => t.latitude !== null && t.longitude !== null
		);
		if (!availableTechs.length) {
			setDriveTimes([]);
			return;
		}

		setLoading(true);
		const service = new routesLib.DistanceMatrixService();
		const destination = { lat: job.latitude, lng: job.longitude };
		const origins = availableTechs.map((t) => ({
			lat: t.latitude!,
			lng: t.longitude!
		}));

		// Access TravelMode/UnitSystem from the loaded library to avoid the
		// `google` global (which isn't in this tsconfig's `types` array).
		const { TravelMode, UnitSystem } = routesLib as unknown as {
			TravelMode: { DRIVING: string };
			UnitSystem: { IMPERIAL: number };
		};

		service.getDistanceMatrix(
			{
				origins,
				destinations: [destination],
				travelMode: TravelMode.DRIVING as never,
				unitSystem: UnitSystem.IMPERIAL as never
			},
			(
				result: {
					rows: Array<{
						elements: Array<{
							status: string;
							duration: { text: string; value: number };
							distance: { text: string };
						}>;
					}>;
				} | null,
				status: string
			) => {
				setLoading(false);
				if (status !== "OK" || !result) return;
				const times: DriveTime[] = [];
				result.rows.forEach((row, i: number) => {
					const el = row.elements[0];
					if (el?.status === "OK") {
						times.push({
							techId: availableTechs[i].techId,
							techName: availableTechs[i].techName,
							durationText: el.duration.text,
							distanceText: el.distance.text,
							durationSeconds: el.duration.value
						});
					}
				});
				times.sort((a, b) => a.durationSeconds - b.durationSeconds);
				setDriveTimes(times);
			}
		);
	}, [routesLib, job, techs]);

	return { driveTimes, loading };
}

// ─── Job detail panel ─────────────────────────────────────────────────────────

function JobDetail({
	job,
	allTechs,
	onClose
}: {
	job: MapJob;
	allTechs: MapTech[];
	onClose: () => void;
}) {
	const assignedTech = allTechs.find((t) => t.techId === job.assignedTechId);
	const { driveTimes, loading } = useDriveTimes(job, allTechs);

	return (
		<div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<p className="text-xs text-text-tertiary mb-1">Job</p>
					<h2 className="font-semibold text-text-primary leading-tight">
						{job.customerName}
					</h2>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 p-1 rounded-lg hover:bg-background-primary text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Badges */}
			<div className="flex flex-wrap gap-1.5">
				<Badge className={PRIORITY_COLORS[job.priority]}>
					{job.priority.charAt(0).toUpperCase() + job.priority.slice(1)}
				</Badge>
				<Badge className={STATUS_COLORS[job.status]}>
					{job.status.replace("_", " ")}
				</Badge>
				{job.jobType && (
					<Badge className="text-text-secondary bg-background-primary border-accent-text/20">
						{JOB_TYPE_LABELS[job.jobType] ?? job.jobType}
					</Badge>
				)}
			</div>

			{/* Details */}
			<div className="flex flex-col gap-2 text-sm">
				<div className="flex items-start gap-2 text-text-secondary">
					<MapPin className="size-3.5 mt-0.5 shrink-0" />
					<span className="leading-snug">{job.address}</span>
				</div>
				<div className="flex items-center gap-2 text-text-secondary">
					<Clock className="size-3.5 shrink-0" />
					<span>{formatTime(job.scheduledTime)}</span>
				</div>
				{assignedTech ? (
					<div className="flex items-center gap-2 text-text-secondary">
						<User className="size-3.5 shrink-0" />
						<span>{assignedTech.techName}</span>
					</div>
				) : (
					<div className="flex items-center gap-2 text-text-tertiary">
						<AlertCircle className="size-3.5 shrink-0" />
						<span>Unassigned</span>
					</div>
				)}
				{job.requiredSkills.length > 0 && (
					<div className="flex items-start gap-2 text-text-secondary">
						<Wrench className="size-3.5 mt-0.5 shrink-0" />
						<span className="leading-snug">
							{job.requiredSkills.join(", ")}
						</span>
					</div>
				)}
			</div>

			{/* Drive times from techs */}
			<div className="border-t border-accent-text/20 pt-3">
				<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
					Drive times from techs
				</p>
				{loading && (
					<p className="text-xs text-text-tertiary">Calculating...</p>
				)}
				{!loading && driveTimes.length === 0 && (
					<p className="text-xs text-text-tertiary">No techs with location</p>
				)}
				<div className="flex flex-col gap-1.5">
					{driveTimes.slice(0, 5).map((dt) => (
						<div
							key={dt.techId}
							className="flex items-center justify-between text-xs"
						>
							<span className="text-text-secondary truncate max-w-[120px]">
								{dt.techName}
							</span>
							<span className="text-text-primary font-medium shrink-0 ml-2">
								{dt.durationText} · {dt.distanceText}
							</span>
						</div>
					))}
				</div>
			</div>

			{/* Action */}
			<a
				href="/dispatch"
				className="mt-auto block text-center px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 transition-opacity"
			>
				Open in Dispatch
			</a>
		</div>
	);
}

// ─── Tech detail panel ────────────────────────────────────────────────────────

function TechDetail({ tech, onClose }: { tech: MapTech; onClose: () => void }) {
	return (
		<div className="flex flex-col h-full overflow-y-auto p-4 gap-4">
			{/* Header */}
			<div className="flex items-start justify-between gap-2">
				<div className="flex-1 min-w-0">
					<p className="text-xs text-text-tertiary mb-1">Technician</p>
					<h2 className="font-semibold text-text-primary leading-tight">
						{tech.techName}
					</h2>
				</div>
				<button
					onClick={onClose}
					className="shrink-0 p-1 rounded-lg hover:bg-background-primary text-text-tertiary hover:text-text-primary transition-colors"
				>
					<X className="size-4" />
				</button>
			</div>

			{/* Availability */}
			<div className="flex items-center gap-2">
				{tech.isAvailable ? (
					<Badge className="text-green-400 bg-green-500/10 border-green-500/30">
						<CheckCircle2 className="size-3 mr-1" />
						Available
					</Badge>
				) : (
					<Badge className="text-text-tertiary bg-background-primary border-accent-text/20">
						Unavailable
					</Badge>
				)}
				{tech.currentJobId && (
					<Badge className="text-purple-400 bg-purple-500/10 border-purple-500/30">
						On a job
					</Badge>
				)}
			</div>

			{/* Details */}
			<div className="flex flex-col gap-2 text-sm">
				{tech.phone && (
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="size-3.5 shrink-0" />
						<a
							href={`tel:${tech.phone}`}
							className="hover:text-text-primary transition-colors"
						>
							{tech.phone}
						</a>
					</div>
				)}
				<div className="flex items-center gap-2 text-text-secondary">
					<Navigation className="size-3.5 shrink-0" />
					<span>
						Last seen{" "}
						<span className="text-text-primary">
							{secondsAgo(tech.secondsSinceUpdate)}
						</span>
					</span>
				</div>
				{tech.skills.length > 0 && (
					<div className="flex items-start gap-2 text-text-secondary">
						<Wrench className="size-3.5 mt-0.5 shrink-0" />
						<span className="leading-snug">{tech.skills.join(", ")}</span>
					</div>
				)}
			</div>

			{/* Trail note */}
			<div className="rounded-xl bg-blue-500/10 border border-blue-500/20 p-3 text-xs text-blue-300">
				Location trail for the past hour is shown on the map.
			</div>
		</div>
	);
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function MapSidePanel({
	selectedJob,
	selectedTech,
	allTechs,
	onClose
}: Props) {
	if (selectedJob) {
		return (
			<JobDetail job={selectedJob} allTechs={allTechs} onClose={onClose} />
		);
	}
	if (selectedTech) {
		return <TechDetail tech={selectedTech} onClose={onClose} />;
	}
	return null;
}
