"use client";

import { useEffect, useRef, useState, useCallback } from "react";
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
import { Search, SlidersHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";

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

// Programmatically pans + zooms the map when `target` changes.
// Must be rendered inside <Map> to access the map instance.
type ZoomTarget = LatLng & { id: number };
function MapController({ target }: { target: ZoomTarget | null }) {
	const map = useMap();
	useEffect(() => {
		if (!map || !target) return;
		map.panTo({ lat: target.lat, lng: target.lng });
		map.setZoom(15);
	}, [map, target]);
	return null;
}

// Search input wired to Google Places Autocomplete.
// Must be rendered inside <APIProvider> so useMapsLibrary has context.
function PlacesInput({ onPlace }: { onPlace: (loc: LatLng) => void }) {
	const placesLib = useMapsLibrary("places");
	const inputRef = useRef<HTMLInputElement>(null);

	useEffect(() => {
		if (!placesLib || !inputRef.current) return;
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const ac = new (placesLib as any).Autocomplete(inputRef.current, {
			fields: ["geometry"]
		});
		const listener = ac.addListener("place_changed", () => {
			const place = ac.getPlace();
			const loc = place?.geometry?.location;
			if (loc) onPlace({ lat: loc.lat(), lng: loc.lng() });
		});
		return () => listener.remove();
	}, [placesLib, onPlace]);

	return (
		<input
			ref={inputRef}
			type="text"
			placeholder="Search location..."
			className="flex-1 bg-transparent text-sm text-text-primary placeholder:text-text-tertiary outline-none min-w-0"
		/>
	);
}

export default function MapPage() {
	const companyId = getCompanyId();
	const setSidePanelOpen = useUiStore((s) => s.setSidePanelOpen);

	const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
	const [selectedTech, setSelectedTech] = useState<MapTech | null>(null);
	const [scheduledAfter, setScheduledAfter] = useState<string | undefined>();
	const [scheduledBefore, setScheduledBefore] = useState<string | undefined>();
	const [filterOpen, setFilterOpen] = useState(false);

	// zoomTarget uses an incrementing id so the same coords can be re-triggered
	const zoomIdRef = useRef(0);
	const [zoomTarget, setZoomTarget] = useState<ZoomTarget | null>(null);

	// Map pins — respects the timeline filter
	const { data: mapData } = useMapData(
		companyId,
		scheduledAfter,
		scheduledBefore
	);
	// Side panel list — all jobs (any status), unaffected by map filter
	const { data: panelData } = useMapData(companyId, undefined, undefined, true);
	const { trail } = useTechTrail(companyId, selectedTech?.techId ?? null);

	// Open the side panel on mount so the jobs list is immediately visible
	useEffect(() => {
		setSidePanelOpen(true);
	}, [setSidePanelOpen]);

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

	const handleZoomTo = useCallback((loc: LatLng) => {
		setZoomTarget({ ...loc, id: ++zoomIdRef.current });
	}, []);

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
					mapId="dispatch-map"
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

					{/* Programmatic pan/zoom controller */}
					<MapController target={zoomTarget} />
				</Map>

				{/* ── Floating overlay — search bar + filter, top-left below header ── */}
				<div className="fixed top-24 left-20 z-20 flex flex-col items-start gap-2">
					{/* Row: search input + filter toggle */}
					<div className="flex items-center gap-2">
						<div className="flex items-center gap-2 bg-background-secondary/80 backdrop-blur-md border border-accent-text/30 rounded-2xl px-3 py-2 shadow-lg w-72">
							<Search className="size-4 text-text-secondary shrink-0" />
							<PlacesInput onPlace={handleZoomTo} />
						</div>

						<button
							onClick={() => setFilterOpen((v) => !v)}
							title="Toggle timeline filter"
							className={cn(
								"size-10 rounded-2xl shadow-lg flex items-center justify-center transition-colors border",
								filterOpen
									? "bg-primary text-primary-foreground border-primary"
									: "bg-background-secondary/80 backdrop-blur-md border-accent-text/30 text-text-secondary hover:text-text-primary"
							)}
						>
							<SlidersHorizontal className="size-4" />
						</button>
					</div>

					{/* Filter panel — drops down below the search row */}
					{filterOpen && (
						<TimelineFilter
							className="relative top-0 left-0 translate-x-0"
							onChange={(after, before) => {
								setScheduledAfter(after);
								setScheduledBefore(before);
							}}
						/>
					)}
				</div>
			</APIProvider>

			<SidePanel>
				<MapSidePanel
					selectedJob={selectedJob}
					selectedTech={selectedTech}
					allTechs={mapData?.techs ?? []}
					allJobs={panelData?.jobs ?? []}
					onJobSelect={handleJobClick}
					onZoomTo={handleZoomTo}
					onClose={handleClose}
				/>
			</SidePanel>
		</MainContent>
	);
}
