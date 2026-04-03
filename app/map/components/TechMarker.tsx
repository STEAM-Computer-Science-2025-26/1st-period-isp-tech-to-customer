"use client";

import { AdvancedMarker } from "@vis.gl/react-google-maps";
import { User } from "lucide-react";
import { type MapTech } from "@/lib/schemas/mapSchemas";

type Props = {
	tech: MapTech;
	isSelected: boolean;
	onClick: () => void;
};

export default function TechMarker({ tech, isSelected, onClick }: Props) {
	const borderColor = tech.isAvailable ? "#22c55e" : "#6b7280";
	const bgColor = tech.isAvailable ? "#166534" : "#374151";

	// Show staleness: grey out if last update > 10 minutes ago
	const isStale =
		tech.secondsSinceUpdate !== null && tech.secondsSinceUpdate > 600;

	return (
		<AdvancedMarker
			position={{ lat: tech.latitude!, lng: tech.longitude! }}
			onClick={onClick}
			zIndex={isSelected ? 100 : 50}
		>
			<div
				className="relative flex items-center justify-center cursor-pointer select-none transition-transform"
				style={{ transform: isSelected ? "scale(1.2)" : "scale(1)" }}
			>
				{/* Avatar circle */}
				<div
					className="flex items-center justify-center rounded-full text-white font-semibold text-xs shadow-lg"
					style={{
						width: isSelected ? 42 : 34,
						height: isSelected ? 42 : 34,
						backgroundColor: isStale ? "#4b5563" : bgColor,
						border: `3px solid ${isSelected ? "white" : borderColor}`,
						opacity: isStale ? 0.7 : 1
					}}
				>
					<User className="size-4" />
				</div>
				{/* Availability dot */}
				<span
					className="absolute top-0 right-0 block rounded-full border-2 border-white"
					style={{
						width: 10,
						height: 10,
						backgroundColor: tech.isAvailable ? "#22c55e" : "#6b7280"
					}}
				/>
			</div>
		</AdvancedMarker>
	);
}
