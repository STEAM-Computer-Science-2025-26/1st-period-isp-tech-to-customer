"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
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
	unassigned: "U",
	assigned: "A",
	in_progress: "►"
};

export default function JobMarker({ job, isSelected, onClick }: Props) {
	const color = PRIORITY_COLORS[job.priority];
	const label = STATUS_LABELS[job.status];
	const isPulsing =
		job.status === "in_progress" || job.priority === "emergency";

	return (
		<AdvancedMarker
			position={{ lat: job.latitude!, lng: job.longitude! }}
			onClick={onClick}
			zIndex={isSelected ? 100 : job.priority === "emergency" ? 90 : 10}
		>
			<div className="relative flex items-center justify-center cursor-pointer select-none">
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
					{label}
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
