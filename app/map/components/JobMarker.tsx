"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { Wrench } from "lucide-react";
import { type MapJob } from "@/lib/schemas/mapSchemas";

type Props = {
	job: MapJob;
	isSelected: boolean;
	onClick: () => void;
};

const PRIORITY_COLORS: Record<MapJob["priority"], string> = {
	emergency: "#ef4444",
	high: "#f97316",
	medium: "#eab308",
	low: "#22c55e"
};

const STATUS_LABELS: Record<MapJob["status"], string> = {
	unassigned: "Unassigned",
	assigned: "Assigned",
	in_progress: "In Progress",
	completed: "Completed",
	cancelled: "Cancelled"
};

const PRIORITY_LABELS: Record<MapJob["priority"], string> = {
	low: "Low",
	medium: "Medium",
	high: "High",
	emergency: "Emergency"
};

export default function JobMarker({ job, isSelected, onClick }: Props) {
	const color = PRIORITY_COLORS[job.priority];
	const isPulsing =
		job.status === "in_progress" || job.priority === "emergency";
	const label = `${job.customerName} — ${STATUS_LABELS[job.status]}, ${PRIORITY_LABELS[job.priority]} priority`;

	return (
		<AdvancedMarker
			position={{ lat: job.latitude!, lng: job.longitude! }}
			onClick={onClick}
			zIndex={isSelected ? 100 : job.priority === "emergency" ? 90 : 10}
		>
			<div
				className="relative flex items-center justify-center cursor-pointer select-none"
				title={label}
				aria-label={label}
			>
				{/* Pulse ring for emergencies / in-progress */}
				{isPulsing && (
					<span
						className="absolute inline-flex h-full w-full rounded-full opacity-75 animate-ping"
						style={{ backgroundColor: color }}
					/>
				)}
				{/* Pin body */}
				<div
					className="relative flex items-center justify-center rounded-full text-white font-bold text-xs shadow-lg transition-transform"
					style={{
						width: isSelected ? 40 : 32,
						height: isSelected ? 40 : 32,
						backgroundColor: color,
						border: isSelected ? "3px solid white" : "2px solid white",
						transform: isSelected ? "scale(1.15)" : "scale(1)"
					}}
				>
					<Wrench className="size-4" />
				</div>
				{/* Pointer triangle */}
				<div
					className="absolute bottom-0 translate-y-[60%]"
					style={{
						width: 0,
						height: 0,
						borderLeft: "5px solid transparent",
						borderRight: "5px solid transparent",
						borderTop: `8px solid ${color}`
					}}
				/>
			</div>
		</AdvancedMarker>
	);
}
