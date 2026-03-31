"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import FadeEnd from "@/components/ui/FadeEnd";
import { useRouter } from "next/navigation";
import { useCustomers } from "@/lib/hooks/useCustomers";
import {
	useOpenToCustomer,
	useOpenToJob,
	useOpenToLocation
} from "@/lib/hooks/useOpenTo";
import { apiFetch } from "@/lib/api";
import {
	formatReadableDate,
	formatReadableDateTime,
	formatRelativeTime,
	formatNumericDate
} from "@/lib/utils";
import { CopyCell } from "@/components/ui/CopyCell";
import CustomersFilterDropdown from "./components/CustomersFilterDropdown";
import {
	countActiveCustomerFilters,
	createEmptyCustomersFilter,
	findFirstCustomerFilterMatch,
	toggleSet,
	type CustomersFilter
} from "./components/customersFilterUtils";
import {
	Search,
	Phone,
	MapPin,
	Calendar,
	ChevronRight,
	AlertCircle,
	Wrench,
	ClipboardList,
	Building2,
	ArrowUp,
	ArrowDown,
	ArrowUpDown,
	SlidersHorizontal,
	ExternalLink
} from "lucide-react";

type CustomerDetailJob = {
	id: string;
	jobType: string;
	status: string;
	priority: string;
	scheduledTime?: string;
	completedAt?: string;
};

type CustomerDetailResponse = {
	customer: {
		id: string;
		firstName: string;
		lastName: string;
		companyName?: string;
		customerType: string;
		email: string;
		phone: string;
		altPhone?: string;
		address: string;
		city: string;
		state: string;
		zip: string;
		latitude?: number | null;
		longitude?: number | null;
		notes?: string;
		isActive: boolean;
		noShowCount: number;
		createdAt: string;
	};
	jobs: CustomerDetailJob[];
	equipment: { id: string; equipmentType: string; ageYears?: number }[];
	locations: {
		id: string;
		label: string;
		address: string;
		city: string;
		state: string;
	}[];
	communications: { id: string }[];
};

function CustomerStatusBadge({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
				active
					? "bg-success/15 text-success-text border-success/30"
					: "bg-background-secondary text-text-tertiary border-background-secondary"
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full",
					active ? "bg-success-text" : "bg-text-tertiary"
				)}
			/>
			{active ? "Active" : "Inactive"}
		</span>
	);
}

function CustomerTypeBadge({ type }: { type: string }) {
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-main/10 text-accent-text border border-accent-main/20 capitalize">
			{type}
		</span>
	);
}

function CustomerDetailPanel({
	customerId,
	onOpenFull
}: {
	customerId: string | null;
	onOpenFull: () => void;
}) {
	const openToJob = useOpenToJob();
	const openToLocation = useOpenToLocation();
	const [data, setData] = useState<CustomerDetailResponse | null>(null);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		if (!customerId) {
			setData(null);
			setError(null);
			setLoading(false);
			return;
		}

		let cancelled = false;
		setLoading(true);
		setError(null);

		void (async () => {
			try {
				const detail = await apiFetch<CustomerDetailResponse>(
					`/customers/${customerId}`
				);
				if (!cancelled) setData(detail);
			} catch (fetchError) {
				if (!cancelled) {
					setError(
						fetchError instanceof Error
							? fetchError.message
							: "Failed to load customer details"
					);
				}
			} finally {
				if (!cancelled) setLoading(false);
			}
		})();

		return () => {
			cancelled = true;
		};
	}, [customerId]);

	if (!customerId) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Select a customer to view details.
			</div>
		);
	}

	if (loading) {
		return (
			<div className="h-full flex items-center justify-center p-5 text-sm text-text-tertiary">
				Loading customer details...
			</div>
		);
	}

	if (error || !data) {
		return (
			<div className="h-full flex flex-col items-center justify-center p-5 gap-3 text-sm text-destructive-text">
				<AlertCircle className="w-5 h-5" />
				<p>{error ?? "Failed to load customer details."}</p>
			</div>
		);
	}

	const { customer, jobs, equipment, locations, communications } = data;
	const customerLatitude =
		typeof customer.latitude === "number" ? customer.latitude : null;
	const customerLongitude =
		typeof customer.longitude === "number" ? customer.longitude : null;
	const hasCustomerCoordinates =
		customerLatitude !== null && customerLongitude !== null;

	return (
		<div className="h-full flex flex-col">
			<div className="px-5 py-4 border-b border-background-secondary flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs text-text-tertiary uppercase tracking-wide">
						Customer
					</p>
					<button
						type="button"
						onClick={onOpenFull}
						className="text-left text-sm font-semibold text-text-main truncate cursor-pointer transition-colors hover:text-accent-text"
						title="Open full customer page"
					>
						{customer.firstName} {customer.lastName}
					</button>
				</div>
				<button
					onClick={onOpenFull}
					className="size-8 grid place-items-center rounded-lg border border-background-secondary text-text-secondary hover:bg-background-secondary transition-colors"
					title="Open full page"
				>
					<ExternalLink className="w-4 h-4" />
				</button>
			</div>

			<div className="flex-1 overflow-y-auto p-5 space-y-4">
				<div className="flex items-center gap-2 flex-wrap">
					<CustomerStatusBadge active={customer.isActive} />
					<CustomerTypeBadge type={customer.customerType} />
					{customer.companyName && (
						<span className="text-xs text-text-secondary inline-flex items-center gap-1">
							<Building2 className="w-3 h-3" />
							{customer.companyName}
						</span>
					)}
				</div>

				<div className="space-y-3 text-sm">
					<div className="flex items-center gap-2 text-text-secondary">
						<Phone className="w-4 h-4 text-text-tertiary" />
						<span>{customer.phone}</span>
					</div>
					<div className="flex items-start gap-2 text-text-secondary">
						<MapPin className="w-4 h-4 mt-0.5 text-text-tertiary" />
						<button
							type="button"
							onClick={() => {
								if (!hasCustomerCoordinates) return;
								openToLocation(customerLatitude, customerLongitude);
							}}
							className={cn(
								"text-left transition-colors",
								hasCustomerCoordinates
									? "cursor-pointer hover:text-text-main"
									: "cursor-default"
							)}
							title={
								hasCustomerCoordinates
									? "Open customer location on map"
									: "Customer location unavailable"
							}
						>
							{customer.address}, {customer.city}, {customer.state}{" "}
							{customer.zip}
						</button>
					</div>
					<div className="flex items-center gap-2 text-text-secondary">
						<Calendar className="w-4 h-4 text-text-tertiary" />
						<span>Member since {formatReadableDate(customer.createdAt)}</span>
					</div>
				</div>

				<div className="grid grid-cols-2 gap-2">
					<div className="rounded-lg border border-background-secondary bg-background-primary p-3">
						<p className="text-xs text-text-tertiary">Jobs</p>
						<p className="text-lg font-semibold text-text-main">
							{jobs.length}
						</p>
					</div>
					<div className="rounded-lg border border-background-secondary bg-background-primary p-3">
						<p className="text-xs text-text-tertiary">No-shows</p>
						<p className="text-lg font-semibold text-text-main">
							{customer.noShowCount}
						</p>
					</div>
					<div className="rounded-lg border border-background-secondary bg-background-primary p-3">
						<p className="text-xs text-text-tertiary">Equipment</p>
						<p className="text-lg font-semibold text-text-main">
							{equipment.length}
						</p>
					</div>
					<div className="rounded-lg border border-background-secondary bg-background-primary p-3">
						<p className="text-xs text-text-tertiary">Locations</p>
						<p className="text-lg font-semibold text-text-main">
							{locations.length}
						</p>
					</div>
				</div>

				<div className="rounded-xl border border-background-secondary bg-background-primary p-3 space-y-2">
					<p className="text-xs uppercase tracking-wide text-text-tertiary inline-flex items-center gap-1">
						<ClipboardList className="w-3 h-3" /> Recent Jobs
					</p>
					{jobs.slice(0, 4).map((job) => (
						<button
							key={job.id}
							type="button"
							onClick={() => openToJob(job.id, "full")}
							title="Open full job page"
							className="w-full rounded-lg border border-background-secondary px-2.5 py-2 text-left cursor-pointer transition-colors hover:bg-background-secondary/30"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="text-xs text-text-main capitalize font-medium transition-colors">
									{job.jobType.replace("_", " ")}
								</p>
								<p className="text-[11px] text-text-tertiary capitalize">
									{job.status.replace("_", " ")}
								</p>
							</div>
							<p className="text-[11px] text-text-tertiary mt-1">
								{formatReadableDateTime(job.scheduledTime ?? job.completedAt)}
							</p>
						</button>
					))}
					{jobs.length === 0 && (
						<p className="text-xs text-text-tertiary">No recent jobs.</p>
					)}
				</div>

				<div className="rounded-xl border border-background-secondary bg-background-primary p-3">
					<p className="text-xs uppercase tracking-wide text-text-tertiary inline-flex items-center gap-1 mb-2">
						<Wrench className="w-3 h-3" /> Operations Snapshot
					</p>
					<p className="text-xs text-text-secondary">
						{communications.length} communication entries logged.
					</p>
					{customer.notes && (
						<p className="text-xs text-text-secondary mt-2 whitespace-pre-wrap">
							{customer.notes}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}

export default function CustomersPage() {
	const { data: customers = [], isLoading: loading, error } = useCustomers();
	const router = useRouter();
	const openToCustomer = useOpenToCustomer();
	const openToLocation = useOpenToLocation();
	const searchParams = useSearchParams();
	const [search, setSearch] = useState("");
	const [filterQuery, setFilterQuery] = useState("");
	const [filters, setFilters] = useState<CustomersFilter>(
		createEmptyCustomersFilter()
	);
	const [filterOpen, setFilterOpen] = useState(false);
	const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
		null
	);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);

	type SortKey =
		| "name"
		| "customerType"
		| "phone"
		| "city"
		| "isActive"
		| "createdAt"
		| null;
	const [sortKey, setSortKey] = useState<SortKey>(null);
	const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
	const [prevSort, setPrevSort] = useState<{
		key: SortKey;
		direction: "asc" | "desc";
	}>({ key: null, direction: "asc" });

	const handleSort = (key: NonNullable<SortKey>) => {
		if (sortKey !== key) {
			setPrevSort({ key: sortKey, direction: sortDirection });
			setSortKey(key);
			setSortDirection("asc");
		} else if (sortDirection === "asc") {
			setSortDirection("desc");
		} else {
			setSortKey(prevSort.key);
			setSortDirection(prevSort.direction);
		}
	};

	// Deep-link support: ?customer=<id>&view=panel|full
	useEffect(() => {
		const customerId = searchParams.get("customer");
		if (!customerId) return;
		const view = searchParams.get("view");
		if (view === "full") {
			router.replace(`/customers/${customerId}`);
			return;
		}
		setSelectedCustomerId(customerId);
		setSidePanelOpen(true);
		router.replace("/customers", { scroll: false });
	}, [searchParams, router]);

	const active = customers.filter((c) => c.isActive).length;
	const residential = customers.filter(
		(c) => c.customerType === "residential"
	).length;
	const commercial = customers.filter(
		(c) => c.customerType === "commercial"
	).length;
	const withNoShows = customers.filter((c) => c.noShowCount > 0).length;

	const filteredCustomers = useMemo(() => {
		const needle = search.trim().toLowerCase();

		const base = customers.filter((customer) => {
			if (
				filters.types.size > 0 &&
				!filters.types.has(
					customer.customerType as "residential" | "commercial"
				)
			) {
				return false;
			}
			if (filters.statuses.size > 0) {
				const needed = filters.statuses.has("active");
				if (filters.statuses.size === 1 && customer.isActive !== needed)
					return false;
				if (filters.statuses.size === 2) {
					/* both selected — no filter */
				}
			}

			if (!needle) return true;

			return [
				customer.firstName,
				customer.lastName,
				customer.companyName,
				customer.phone,
				customer.address,
				customer.city
			]
				.filter(
					(value): value is string =>
						typeof value === "string" && value.length > 0
				)
				.some((value) => value.toLowerCase().includes(needle));
		});

		if (!sortKey) return base;

		const direction = sortDirection === "asc" ? 1 : -1;
		return [...base].sort((a, b) => {
			switch (sortKey) {
				case "name":
					return (
						`${a.firstName} ${a.lastName}`.localeCompare(
							`${b.firstName} ${b.lastName}`
						) * direction
					);
				case "customerType":
					return a.customerType.localeCompare(b.customerType) * direction;
				case "phone":
					return a.phone.localeCompare(b.phone) * direction;
				case "city":
					return (
						`${a.city}, ${a.state}`.localeCompare(`${b.city}, ${b.state}`) *
						direction
					);
				case "isActive":
					return (Number(b.isActive) - Number(a.isActive)) * direction;
				case "createdAt":
					return (
						(new Date(a.createdAt).getTime() -
							new Date(b.createdAt).getTime()) *
						direction
					);
				default:
					return 0;
			}
		});
	}, [customers, search, filters, sortKey, sortDirection]);

	const handleSelectCustomer = (customerId: string) => {
		setSelectedCustomerId(customerId);
		setSidePanelOpen(true);
		openToCustomer(customerId, "panel");
	};

	const copyToClipboard = async (text: string) => {
		if (!text) return;
		try {
			await navigator.clipboard.writeText(text);
		} catch {
			const fallback = document.createElement("textarea");
			fallback.value = text;
			fallback.setAttribute("readonly", "true");
			fallback.style.position = "absolute";
			fallback.style.left = "-9999px";
			document.body.appendChild(fallback);
			fallback.select();
			document.execCommand("copy");
			document.body.removeChild(fallback);
		}
	};

	return (
		<>
			<MainContent
				headerTitle="Customers"
				className={cn("flex flex-col gap-4")}
			>
				<FadeEnd
					className={cn("h-32 w-full overflow-hidden")}
					orientation="horizontal"
					prefix="both"
					fromColorClass="from-background-main"
					sizeClass="w-8"
					wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"
				>
					<KpiCard
						title="Total Customers"
						value={String(customers.length)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Active"
						value={String(active)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Residential"
						value={String(residential)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Commercial"
						value={String(commercial)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="With No-Shows"
						value={String(withNoShows)}
						className={cn("w-xs shrink-0")}
					/>
				</FadeEnd>

				<div className="mx-2 rounded-xl flex flex-col gap-3">
					<div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
						<div className="relative w-full lg:max-w-md">
							<div className="flex w-full items-center gap-2">
								<div className="relative z-30 w-full">
									<Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
									<input
										type="text"
										value={filterOpen ? filterQuery : search}
										onChange={(event) => {
											if (filterOpen) setFilterQuery(event.target.value);
											else setSearch(event.target.value);
										}}
										onKeyDown={(event) => {
											if (filterOpen && event.key === "Enter") {
												event.preventDefault();
												const match = findFirstCustomerFilterMatch(filterQuery);
												if (!match) return;
												setFilters((cur) => ({
													...cur,
													...(match.type === "customerType"
														? { types: toggleSet(cur.types, match.value) }
														: {
																statuses: toggleSet(cur.statuses, match.value)
															})
												}));
											}
										}}
										placeholder={
											filterOpen
												? "Search filters..."
												: "Search name, company, phone, or location"
										}
										className={cn(
											"w-full rounded-lg border border-background-secondary bg-background-primary pl-9 pr-3 py-2 text-sm text-text-main placeholder:text-text-tertiary focus:outline-none focus:border-accent-main/50",
											filterOpen &&
												"bg-transparent border-transparent focus:border-transparent"
										)}
									/>
								</div>
								<button
									onClick={() => setFilterOpen((v) => !v)}
									title="Toggle customer filters"
									className={cn(
										"relative z-30 flex size-10 shrink-0 items-center justify-center rounded-lg",
										filterOpen
											? "border-transparent bg-primary text-primary-foreground"
											: "border border-accent-text/30 bg-background-primary text-text-secondary backdrop-blur-md transition-colors hover:bg-background-secondary/50 hover:text-text-primary"
									)}
								>
									<SlidersHorizontal className="size-4" />
									{countActiveCustomerFilters(filters) > 0 && (
										<span className="absolute -right-1 -top-1 grid size-4 place-items-center rounded-full border border-background-secondary bg-accent-main/50 text-[10px] font-bold text-primary-foreground">
											{countActiveCustomerFilters(filters)}
										</span>
									)}
								</button>
							</div>
							{filterOpen && (
								<CustomersFilterDropdown
									className="absolute left-0 top-[calc(100%+0.5rem)] w-full"
									searchQuery={filterQuery}
									value={filters}
									onChange={setFilters}
									onClear={() => setFilters(createEmptyCustomersFilter())}
								/>
							)}
						</div>
						<button
							onClick={() => {
								setSearch("");
								setFilterQuery("");
								setFilters(createEmptyCustomersFilter());
							}}
							className="self-start rounded-lg border border-background-secondary px-2.5 py-2 text-xs text-text-secondary hover:bg-background-secondary transition-colors lg:self-auto"
						>
							Clear
						</button>
					</div>

					<div className="w-full rounded-xl border border-background-secondary bg-background-primary relative pt-12">
						<div
							className="border-b px-3 border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_1fr_1.5rem]"
							role="row"
						>
							{(
								[
									{ label: "Name", key: "name" },
									{ label: "Type", key: "customerType" },
									{ label: "Phone", key: "phone" },
									{ label: "Address", key: "city" },
									{ label: "Status", key: "isActive" },
									{ label: "Since", key: "createdAt" },
									{ label: "", key: null }
								] as const
							).map((col) => (
								<div
									key={col.label}
									role="columnheader"
									className="text-sm font-medium text-foreground/60"
								>
									{col.key ? (
										<button
											type="button"
											onClick={() => handleSort(col.key)}
											className="group flex items-center gap-1.5 hover:text-foreground/80 transition-colors"
											aria-label={`Sort by ${col.label}`}
										>
											<span>{col.label}</span>
											<span
												className={cn(
													"text-text-tertiary transition-opacity",
													sortKey === col.key
														? "opacity-100"
														: "opacity-0 group-hover:opacity-100"
												)}
											>
												{sortKey === col.key ? (
													sortDirection === "asc" ? (
														<ArrowUp className="w-3 h-3" />
													) : (
														<ArrowDown className="w-3 h-3" />
													)
												) : (
													<ArrowUpDown className="w-3 h-3" />
												)}
											</span>
										</button>
									) : null}
								</div>
							))}
						</div>

						<ul className="w-full divide-y divide-background-secondary/50 px-4 py-3">
							{loading && (
								<li className="text-xs text-text-tertiary py-3 px-4">
									Loading customers...
								</li>
							)}
							{!loading && filteredCustomers.length === 0 && (
								<li className="text-xs text-text-tertiary py-3 px-4">
									No customers match the current filters.
								</li>
							)}
							{filteredCustomers.map((c) => {
								const latitude = typeof c.latitude === "number" ? c.latitude : null;
								const longitude =
									typeof c.longitude === "number" ? c.longitude : null;
								const hasCoordinates = latitude !== null && longitude !== null;
								const fullAddress = `${c.address}, ${c.city}, ${c.state} ${c.zip}`
									.replace(/\s+/g, " ")
									.trim();

								return (
									<li
										key={c.id}
										className={cn(
											"grid group grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_1fr_1.5rem] items-center px-4 py-3 cursor-pointer hover:bg-background-secondary/30 first:rounded-t-lg last:rounded-b-lg transition-colors",
											selectedCustomerId === c.id && "bg-accent-main/10"
										)}
										role="row"
										onClick={() => handleSelectCustomer(c.id)}
										title="Open customer details in the side panel"
									>
										<div role="cell" className="min-w-0">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													openToCustomer(c.id, "full");
												}}
												className="w-full truncate text-left text-sm font-medium text-text-main transition-colors hover:text-accent-text"
												title="Open full customer page"
											>
												{c.firstName} {c.lastName}
											</button>
										</div>
										<p className="text-sm capitalize text-text-secondary">
											{c.customerType}
										</p>
										<CopyCell
											value={c.phone}
											copyText={c.phone}
											className="text-sm text-text-secondary"
											textClassName="truncate"
											ariaLabel="Copy phone"
											onCopy={copyToClipboard}
										/>
										<div role="cell" className="min-w-0">
											<button
												type="button"
												onClick={(event) => {
													if (!hasCoordinates) return;
													event.stopPropagation();
													openToLocation(latitude, longitude);
												}}
												className={cn(
													"w-full truncate text-left text-sm transition-colors",
													hasCoordinates
														? "cursor-pointer text-text-secondary hover:text-accent-text"
														: "cursor-default text-text-secondary"
												)}
												title={
													hasCoordinates
														? "Open customer location on map"
														: "Customer location unavailable"
												}
											>
												{fullAddress}
											</button>
										</div>
										<div>
											<CustomerStatusBadge active={c.isActive} />
										</div>
										<p className="text-xs text-text-tertiary">
											{formatNumericDate(c.createdAt)} (
											{formatRelativeTime(c.createdAt)})
										</p>
										<div role="cell" className="flex items-center justify-end">
											<button
												type="button"
												onClick={(event) => {
													event.stopPropagation();
													handleSelectCustomer(c.id);
												}}
												className="inline-flex cursor-pointer items-center justify-center text-text-tertiary transition-colors hover:text-text-main"
												title="Open customer detail panel"
											>
												<ChevronRight className="w-4 h-4 group-hover:scale-175 transition-transform" />
											</button>
										</div>
									</li>
								);
							})}
						</ul>
					</div>

					<div className="text-xs text-text-tertiary px-1">
						Showing {filteredCustomers.length} of {customers.length} customers
					</div>
				</div>

				{error && (
					<p className={cn("mx-2 text-sm text-red-600")}>{error.message}</p>
				)}
			</MainContent>
			<SidePanel isOpen={sidePanelOpen} onOpenChange={setSidePanelOpen}>
				<CustomerDetailPanel
					customerId={selectedCustomerId}
					onOpenFull={() => {
						if (!selectedCustomerId) return;
						openToCustomer(selectedCustomerId, "full");
						setSidePanelOpen(false);
					}}
				/>
			</SidePanel>
		</>
	);
}
