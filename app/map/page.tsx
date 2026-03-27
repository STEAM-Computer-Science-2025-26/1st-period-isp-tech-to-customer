"use client";

import { useEffect, useState } from "react";
import {
	APIProvider,
	Map,
	useMap,
	useMapsLibrary
} from "@vis.gl/react-google-maps";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { useUiStore } from "@/lib/stores/uiStore";
import { getCompanyId } from "@/lib/auth";
import { type MapJob, type MapTech } from "@/lib/schemas/mapSchemas";
import { useMapData } from "./hooks/useMapData";
import { useTechTrail } from "./hooks/useTechTrail";
import JobMarker from "./components/JobMarker";
import TechMarker from "./components/TechMarker";
import TimelineFilter from "./components/TimelineFilter";
import MapSidePanel from "./components/MapSidePanel";

const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";

// Atlanta — sensible default center for an HVAC dispatch map
const DEFAULT_CENTER = { lat: 33.749, lng: -84.388 };

// Draws a polyline using the imperative Maps API since @vis.gl/react-google-maps
// v1.7.1 does not export a Polyline component.
type LatLng = { lat: number; lng: number };
function TrailPolyline({ path }: { path: LatLng[] }) {
	const map = useMap();
	const mapsLib = useMapsLibrary("maps");

	useEffect(() => {
		if (!map || !mapsLib || path.length < 2) return;
		const poly = new mapsLib.Polyline({
			path,
			strokeColor: "#3b82f6",
			strokeWeight: 3,
			strokeOpacity: 0.75,
			map
		});
		return () => poly.setMap(null);
	}, [map, mapsLib, path]);

	return null;
}

export default function MapPage() {
	const companyId = getCompanyId();
	const setSidePanelOpen = useUiStore((s) => s.setSidePanelOpen);

	const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
	const [selectedTech, setSelectedTech] = useState<MapTech | null>(null);
	const [scheduledAfter, setScheduledAfter] = useState<string | undefined>();
	const [scheduledBefore, setScheduledBefore] = useState<string | undefined>();

	const { data: mapData } = useMapData(
		companyId,
		scheduledAfter,
		scheduledBefore
	);
	const { trail } = useTechTrail(companyId, selectedTech?.techId ?? null);

	// Keep side panel in sync with selection
	useEffect(() => {
		setSidePanelOpen(!!selectedJob || !!selectedTech);
	}, [selectedJob, selectedTech, setSidePanelOpen]);

	function handleJobClick(job: MapJob) {
		setSelectedJob(job);
		setSelectedTech(null);
	}

	function handleTechClick(tech: MapTech) {
		setSelectedTech(tech);
		setSelectedJob(null);
	}

	function handleClose() {
		setSelectedJob(null);
		setSelectedTech(null);
	}

	const geocodedJobs = (mapData?.jobs ?? []).filter(
		(j) => j.latitude !== null && j.longitude !== null
	);
	const locatedTechs = (mapData?.techs ?? []).filter(
		(t) => t.latitude !== null && t.longitude !== null
	);

	const trailPath = trail.map((p) => ({ lat: p.latitude, lng: p.longitude }));

	return (
		<MainContent>
			<APIProvider apiKey={MAPS_API_KEY} libraries={["routes", "geometry"]}>
				<Map
					className="fixed h-dvh w-dvw top-0 left-0"
					defaultCenter={DEFAULT_CENTER}
					defaultZoom={11}
					gestureHandling="greedy"
					disableDefaultUI
				>
					{/* Job pins */}
					{geocodedJobs.map((job) => (
						<JobMarker
							key={job.id}
							job={job}
							isSelected={selectedJob?.id === job.id}
							onClick={() => handleJobClick(job)}
						/>
					))}

					{/* Tech pins */}
					{locatedTechs.map((tech) => (
						<TechMarker
							key={tech.techId}
							tech={tech}
							isSelected={selectedTech?.techId === tech.techId}
							onClick={() => handleTechClick(tech)}
						/>
					))}

					{/* Tech location trail (past hour, snapped to roads) */}
					{trailPath.length > 1 && <TrailPolyline path={trailPath} />}
				</Map>

				{/* Timeline filter overlay */}
				<TimelineFilter
					onChange={(after, before) => {
						setScheduledAfter(after);
						setScheduledBefore(before);
					}}
				/>
			</APIProvider>

			<SidePanel>
				<MapSidePanel
					selectedJob={selectedJob}
					selectedTech={selectedTech}
					allTechs={mapData?.techs ?? []}
					onClose={handleClose}
				/>
			</SidePanel>
		</MainContent>
	);
}
