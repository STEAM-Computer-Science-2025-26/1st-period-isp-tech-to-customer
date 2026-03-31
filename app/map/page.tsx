"use client";

import {
	Suspense,
	useEffect,
	useRef,
	useState,
	useCallback,
	useMemo,
	type KeyboardEvent
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
	APIProvider,
	Map,
	useMap,
	useMapsLibrary
} from "@vis.gl/react-google-maps";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { useBreakpoints } from "../hooks/useBreakpoints";
import { useUiStore } from "@/lib/stores/uiStore";
import { getCompanyId } from "@/lib/auth";
import { type MapJob, type MapTech } from "@/lib/schemas/mapSchemas";
import { useMapData } from "./hooks/useMapData";
import { useTechTrail } from "./hooks/useTechTrail";
import JobMarker from "./components/JobMarker";
import TechMarker from "./components/TechMarker";
import MapSidePanel from "./components/MapSidePanel";
import MapFilterDropdown from "./components/MapFilterDropdown";
import {
	applyPanelFilter,
	countActiveFilters,
	createEmptyFilter,
	findFirstFilterMatch,
	toggleSet,
	type PanelFilter
} from "./components/mapFilterUtils";
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

type SuggestionItem =
	| {
			type: "job-address";
			job: MapJob;
			id: string;
			label: string;
			subLabel?: string;
	  }
	| {
			type: "job-customer";
			job: MapJob;
			id: string;
			label: string;
			subLabel?: string;
	  }
	| {
			type: "place";
			prediction: google.maps.places.AutocompletePrediction;
			id: string;
			label: string;
			subLabel?: string;
	  };

// Search input wired to Google Places Autocomplete or filter search mode.
// Must be rendered inside <APIProvider> so useMapsLibrary has context.
function PlacesInput({
	mode,
	onPlace,
	query,
	onQueryChange,
	onFilterSubmit,
	active,
	onDropdownOpenChange,
	jobs = [],
	onJobSelect
}: {
	mode: "place" | "filters";
	onPlace: (loc: LatLng) => void;
	query: string;
	onQueryChange: (value: string) => void;
	onFilterSubmit?: (query: string) => void;
	active?: boolean;
	onDropdownOpenChange?: (open: boolean) => void;
	jobs?: MapJob[];
	onJobSelect?: (job: MapJob) => void;
}) {
	const placesLib = useMapsLibrary("places");
	const inputRef = useRef<HTMLInputElement>(null);
	const dropdownRef = useRef<HTMLDivElement>(null);

	const [placeQuery, setPlaceQuery] = useState("");
	const [predictions, setPredictions] = useState<
		google.maps.places.AutocompletePrediction[]
	>([]);
	const [focused, setFocused] = useState(false);

	// Fetch google place predictions
	useEffect(() => {
		if (mode !== "place" || !placesLib) return;
		const trimmed = placeQuery.trim();
		if (!trimmed) {
			setPredictions([]);
			return;
		}

		const delay = setTimeout(() => {
			const service = new (placesLib as any).AutocompleteService();
			service.getPlacePredictions(
				{ input: trimmed },
				(results: any[] | null, status: string) => {
					if (status === "OK" && results) {
						setPredictions(results);
					} else {
						setPredictions([]);
					}
				}
			);
		}, 300);
		return () => clearTimeout(delay);
	}, [placeQuery, mode, placesLib]);

	// Close on outside click
	useEffect(() => {
		function handleClickOutside(e: MouseEvent) {
			const target = e.target as Node;
			if (
				inputRef.current &&
				!inputRef.current.contains(target) &&
				dropdownRef.current &&
				!dropdownRef.current.contains(target)
			) {
				setFocused(false);
			}
		}
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, []);

	const suggestions = useMemo(() => {
		if (mode !== "place" || !placeQuery.trim()) return [];
		const q = placeQuery.toLowerCase().trim();
		const matchedJobs: SuggestionItem[] = [];
		const seenJobKeys = new Set<string>();

		for (const job of jobs) {
			if (job.latitude === null || job.longitude === null) continue;

			const jobKey = `${job.customerName}|${job.address}`.toLowerCase();

			// Exact/partial matches
			const addrMatch = job.address.toLowerCase().includes(q);
			const nameMatch = job.customerName.toLowerCase().includes(q);

			if (addrMatch) {
				if (!seenJobKeys.has(jobKey)) {
					seenJobKeys.add(jobKey);
					matchedJobs.push({
						type: "job-address",
						job,
						id: `job-addr-${job.id}`,
						label: job.address,
						subLabel: `Job • ${job.customerName}`
					});
				}
			} else if (nameMatch) {
				if (!seenJobKeys.has(jobKey)) {
					seenJobKeys.add(jobKey);
					matchedJobs.push({
						type: "job-customer",
						job,
						id: `job-name-${job.id}`,
						label: job.customerName,
						subLabel: `Job • ${job.address}`
					});
				}
			}
		}

		const addressJobs = matchedJobs.filter((m) => m.type === "job-address");
		const customerJobs = matchedJobs.filter((m) => m.type === "job-customer");

		const placeSuggestions: SuggestionItem[] = predictions.map((p) => ({
			type: "place",
			prediction: p,
			id: p.place_id,
			label: p.structured_formatting.main_text,
			subLabel: p.structured_formatting.secondary_text
		}));

		return [...addressJobs, ...customerJobs, ...placeSuggestions].slice(0, 8);
	}, [mode, placeQuery, jobs, predictions]);

	const dropdownOpen = focused && suggestions.length > 0;

	const handleSelect = (item: SuggestionItem) => {
		if (item.type === "place") {
			if (!placesLib) return;
			const placesService = new (placesLib as any).PlacesService(
				document.createElement("div")
			);
			placesService.getDetails(
				{ placeId: item.prediction.place_id, fields: ["geometry"] },
				(place: any, detailStatus: string) => {
					if (detailStatus === "OK" && place?.geometry?.location) {
						onPlace({
							lat: place.geometry.location.lat(),
							lng: place.geometry.location.lng()
						});
					}
				}
			);
		} else {
			if (onJobSelect) onJobSelect(item.job);
			if (item.job.latitude !== null && item.job.longitude !== null) {
				onPlace({ lat: item.job.latitude, lng: item.job.longitude });
			}
		}
		setFocused(false);
		setPlaceQuery("");
		if (inputRef.current) inputRef.current.blur();
	};

	useEffect(() => {
		onDropdownOpenChange?.(dropdownOpen);
	}, [dropdownOpen, onDropdownOpenChange]);

	const handleKeyDown = (
		event: KeyboardEvent<HTMLInputElement | HTMLDivElement>
	) => {
		if (mode === "filters") {
			if (event.key === "Enter") {
				event.preventDefault();
				onFilterSubmit?.(query);
			}
			return;
		}

		if (!focused || suggestions.length === 0) {
			if (event.key === "Enter" && placeQuery.trim()) {
				if (suggestions.length > 0) {
					event.preventDefault();
					handleSelect(suggestions[0]);
				}
			}
			return;
		}

		if (event.key === "ArrowDown" || event.key === "ArrowUp") {
			event.preventDefault();
			const items = Array.from(
				dropdownRef.current?.querySelectorAll<HTMLButtonElement>(
					"[data-search-item='true']"
				) || []
			);
			if (!items.length) return;

			const currentIndex = items.indexOf(
				document.activeElement as HTMLButtonElement
			);
			let nextIndex = currentIndex;
			if (event.key === "ArrowDown")
				nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
			if (event.key === "ArrowUp")
				nextIndex =
					currentIndex === -1
						? items.length - 1
						: (currentIndex - 1 + items.length) % items.length;
			items[nextIndex]?.focus();
		}

		if (event.key === "Enter") {
			if (
				document.activeElement === inputRef.current &&
				suggestions.length > 0
			) {
				event.preventDefault();
				handleSelect(suggestions[0]);
			}
		}
	};

	if (mode === "filters") {
		return (
			<div
				className={cn(
					"relative z-30 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2",
					active
						? "border-transparent bg-primary text-primary-foreground backdrop-blur-none"
						: "border-accent-text/30 bg-background-secondary/50 text-text-secondary shadow-lg backdrop-blur-md transition-colors hover:bg-background-secondary/80 hover:text-text-primary"
				)}
			>
				<Search
					className={cn(
						"size-4 shrink-0",
						active ? "text-primary-foreground" : "text-text-secondary"
					)}
				/>
				<input
					key="filters"
					type="text"
					value={query}
					onChange={(event) => onQueryChange(event.target.value)}
					onKeyDown={handleKeyDown}
					placeholder="Search filters..."
					className={cn(
						"flex-1 bg-transparent text-sm outline-none min-w-0 placeholder:text-text-tertiary",
						active
							? "text-primary-foreground placeholder:text-primary-foreground/70"
							: "text-text-primary"
					)}
				/>
			</div>
		);
	}

	return (
		<>
			<div
				className={cn(
					"relative z-30 flex min-w-0 flex-1 items-center gap-2 rounded-lg border px-3 py-2",
					active
						? "border-transparent bg-primary text-primary-foreground backdrop-blur-none"
						: "border-accent-text/30 bg-background-secondary/50 text-text-secondary shadow-lg backdrop-blur-md transition-colors hover:bg-background-secondary/80 hover:text-text-primary"
				)}
			>
				<Search
					className={cn(
						"size-4 shrink-0",
						active ? "text-primary-foreground" : "text-text-secondary"
					)}
				/>
				<input
					key="place"
					ref={inputRef}
					type="text"
					value={placeQuery}
					onChange={(e) => {
						setPlaceQuery(e.target.value);
						setFocused(true);
					}}
					onFocus={() => setFocused(true)}
					onKeyDown={handleKeyDown}
					placeholder="Search location or customer..."
					className={cn(
						"flex-1 bg-transparent text-sm outline-none min-w-0 placeholder:text-text-tertiary",
						active
							? "text-primary-foreground placeholder:text-primary-foreground/70"
							: "text-text-primary"
					)}
				/>
			</div>

			{dropdownOpen && (
				<div
					ref={dropdownRef}
					onKeyDown={handleKeyDown}
					className="absolute top-[calc(100%+0.5rem)] left-0 w-[calc(100%-3rem)] z-20 -mt-12 pt-10 rounded-lg border border-accent-text/20 bg-background-secondary/50 shadow-2xl shadow-black/15 ring-1 ring-black/5 backdrop-blur-md"
				>
					<div className="scrollbar-thumb-only max-h-64 overflow-y-auto py-2 flex flex-col">
						{suggestions.map((item) => (
							<button
								key={item.id}
								type="button"
								data-search-item="true"
								onClick={() => handleSelect(item)}
								className="flex w-full flex-col items-start px-4 py-2 text-sm transition-colors hover:bg-background-secondary/70 focus:bg-background-secondary/70 outline-none text-text-primary border-b border-text-secondary/10 last:border-0"
							>
								<span className="font-medium text-left truncate w-full">
									{item.label}
								</span>
								{item.subLabel && (
									<span className="text-text-secondary text-[11px] truncate w-full text-left uppercase tracking-wider">
										{item.subLabel}
									</span>
								)}
							</button>
						))}
					</div>
				</div>
			)}
		</>
	);
}

function MapPageContent() {
	const companyId = getCompanyId();
	const setSidePanelOpen = useUiStore((s) => s.setSidePanelOpen);
	const sidebarAutoCollapse = useUiStore((s) => s.sidebarAutoCollapse);
	const sidebarIsStrip = useUiStore((s) => s.sidebarIsStrip);
	const { lgUp, smDown } = useBreakpoints();
	const searchParams = useSearchParams();
	const router = useRouter();

	const [selectedJob, setSelectedJob] = useState<MapJob | null>(null);
	const [selectedTech, setSelectedTech] = useState<MapTech | null>(null);
	// Stores a job ID from deep-link params until panelData loads
	const pendingJobIdRef = useRef<string | null>(null);
	const [mapFilters, setMapFilters] = useState<PanelFilter>(() =>
		createEmptyFilter()
	);
	const [filterOpen, setFilterOpen] = useState(false);
	const [filterQuery, setFilterQuery] = useState("");
	const [searchDropdownOpen, setSearchDropdownOpen] = useState(false);

	// zoomTarget uses an incrementing id so the same coords can be re-triggered
	const zoomIdRef = useRef(0);
	const [zoomTarget, setZoomTarget] = useState<ZoomTarget | null>(null);
	const activeFilterCount = countActiveFilters(mapFilters);
	const scheduledAfter = mapFilters.dateAfter || undefined;
	const scheduledBefore = mapFilters.dateBefore || undefined;
	const overlayLeft = lgUp
		? sidebarAutoCollapse
			? "calc(4.5rem + 1rem)"
			: "calc(var(--sidebar-desktop-width) + 1rem)"
		: sidebarIsStrip
			? "5.5rem"
			: "1.5rem";
	const overlayWidth = smDown ? "auto" : "22rem";
	const searchActive = filterOpen || searchDropdownOpen;
	const filterActive = filterOpen;
	const searchMode = filterOpen ? "filters" : "place";

	const handleFilterSubmit = useCallback((query: string) => {
		const match = findFirstFilterMatch(query);
		if (!match) return;

		setMapFilters((current) => {
			switch (match.type) {
				case "status":
					return {
						...current,
						statuses: toggleSet(current.statuses, match.value)
					};
				case "priority":
					return {
						...current,
						priorities: toggleSet(current.priorities, match.value)
					};
				case "jobType":
					return {
						...current,
						jobTypes: toggleSet(current.jobTypes, match.value)
					};
				case "zipCode":
					return {
						...current,
						zipCode: match.value
					};
			}
		});
	}, []);

	useEffect(() => {
		if (!filterOpen) {
			setFilterQuery("");
		}
	}, [filterOpen]);

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

	// Deep-link support: ?job=<id> or ?lat=<lat>&lng=<lng>
	useEffect(() => {
		const jobId = searchParams.get("job");
		const lat = searchParams.get("lat");
		const lng = searchParams.get("lng");
		if (lat && lng) {
			handleZoomTo({ lat: parseFloat(lat), lng: parseFloat(lng) });
			router.replace("/map", { scroll: false });
			return;
		}
		if (jobId) {
			pendingJobIdRef.current = jobId;
			router.replace("/map", { scroll: false });
		}
	}, [searchParams, handleZoomTo, router]);

	// Once panelData loads, resolve any pending deep-link job
	useEffect(() => {
		const pendingId = pendingJobIdRef.current;
		if (!pendingId || !panelData) return;
		const job = panelData.jobs.find((j) => j.id === pendingId);
		if (job) {
			handleJobClick(job);
			if (job.latitude !== null && job.longitude !== null) {
				handleZoomTo({ lat: job.latitude, lng: job.longitude });
			}
			pendingJobIdRef.current = null;
		}
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [panelData, handleZoomTo]);

	const locatedTechs = (mapData?.techs ?? []).filter(
		(t) => t.latitude !== null && t.longitude !== null
	);

	const trailPath = trail.map((p) => ({ lat: p.latitude, lng: p.longitude }));
	const visibleJobs = applyPanelFilter(mapData?.jobs ?? [], mapFilters);

	return (
		<MainContent showFab={false}>
			<APIProvider
				apiKey={MAPS_API_KEY}
				libraries={["routes", "geometry", "places"]}
			>
				<Map
					className="fixed h-dvh w-dvw top-0 left-0"
					defaultCenter={DEFAULT_CENTER}
					defaultZoom={11}
					gestureHandling="greedy"
					disableDefaultUI
					mapId="dispatch-map"
				>
					{/* Job pins */}
					{visibleJobs
						.filter((job) => job.latitude !== null && job.longitude !== null)
						.map((job) => (
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

				{/* ── Floating overlay — search bar + sectioned filter dropdown ── */}
				<div
					className="fixed top-24 z-20"
					style={{
						left: smDown ? "2rem" : overlayLeft,
						right: smDown ? "2rem" : lgUp ? "auto" : "1.5rem",
						width: overlayWidth
					}}
				>
					<div className="relative w-full">
						<div className="flex w-full items-center gap-2">
							<PlacesInput
								mode={searchMode}
								onPlace={handleZoomTo}
								query={filterQuery}
								onQueryChange={setFilterQuery}
								onFilterSubmit={handleFilterSubmit}
								active={searchActive}
								onDropdownOpenChange={setSearchDropdownOpen}
								jobs={panelData?.jobs ?? []}
								onJobSelect={handleJobClick}
							/>

							<button
								onClick={() => setFilterOpen((v) => !v)}
								title="Toggle map filters"
								className={cn(
									"relative z-30 flex size-10 shrink-0 items-center justify-center rounded-lg",
									filterActive
										? "border-transparent bg-primary text-primary-foreground"
										: "border border-accent-text/30 bg-background-secondary/50 text-text-secondary shadow-lg backdrop-blur-md transition-colors hover:bg-background-secondary/80 hover:text-text-primary"
								)}
							>
								<SlidersHorizontal className="size-4" />
								{activeFilterCount > 0 ? (
									<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-background-secondary bg-accent-main/50 text-[10px] font-bold text-primary-foreground">
										{activeFilterCount}
									</span>
								) : null}
							</button>
						</div>

						{filterOpen ? (
							<MapFilterDropdown
								className="absolute left-0 top-[calc(100%+0.5rem)] w-full"
								searchQuery={filterQuery}
								value={mapFilters}
								onChange={setMapFilters}
								onClear={() => setMapFilters(createEmptyFilter())}
							/>
						) : null}
					</div>
				</div>
				<div
					className={cn(
						`fixed right-4 bottom-4 w-12 h-24 rounded-md bg-background-secondary/50 backdrop-blur-md border-accent-text-dark-3 flex flex-col divide-y divide-text-secondary/70 overflow-hidden p-1.25`
					)}
				>
					<button
						className={cn(
							`w-full mb-[calc(6/8*1rem)] h-full hover:bg-background-secondary/70`
						)}
					></button>
					<button
						className={cn(
							`w-full mt-0.625 h-full hover:bg-background-secondary/70`
						)}
					></button>
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

export default function MapPage() {
	return (
		<Suspense fallback={null}>
			<MapPageContent />
		</Suspense>
	);
}
