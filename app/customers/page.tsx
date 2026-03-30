"use client";

import { useMemo, useState, useEffect } from "react";
import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import FadeEnd from "@/components/ui/FadeEnd";
import { useRouter } from "next/navigation";
import { useCustomers } from "@/lib/hooks/useCustomers";
import { apiFetch } from "@/lib/api";
import {
	formatReadableDate,
	formatReadableDateTime,
	formatRelativeTime
} from "@/lib/utils";
import {
	Search,
	Filter,
	Phone,
	MapPin,
	Calendar,
	ChevronRight,
	AlertCircle,
	Wrench,
	ClipboardList,
	Building2
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

	return (
		<div className="h-full flex flex-col">
			<div className="px-5 py-4 border-b border-background-secondary flex items-center justify-between gap-2">
				<div className="min-w-0">
					<p className="text-xs text-text-tertiary uppercase tracking-wide">
						Customer
					</p>
					<h3 className="text-sm font-semibold text-text-main truncate">
						{customer.firstName} {customer.lastName}
					</h3>
				</div>
				<button
					onClick={onOpenFull}
					className="text-xs px-2.5 py-1 rounded-lg bg-accent-main text-white hover:opacity-90 transition-opacity"
				>
					Open Full Page
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
						<span>
							{customer.address}, {customer.city}, {customer.state}{" "}
							{customer.zip}
						</span>
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
						<div
							key={job.id}
							className="rounded-lg border border-background-secondary px-2.5 py-2"
						>
							<div className="flex items-center justify-between gap-2">
								<p className="text-xs text-text-main capitalize font-medium">
									{job.jobType.replace("_", " ")}
								</p>
								<p className="text-[11px] text-text-tertiary capitalize">
									{job.status.replace("_", " ")}
								</p>
							</div>
							<p className="text-[11px] text-text-tertiary mt-1">
								{formatReadableDateTime(job.scheduledTime ?? job.completedAt)}
							</p>
						</div>
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
	const [search, setSearch] = useState("");
	const [typeFilter, setTypeFilter] = useState<
		"all" | "residential" | "commercial"
	>("all");
	const [statusFilter, setStatusFilter] = useState<
		"all" | "active" | "inactive"
	>("all");
	const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
		null
	);
	const [sidePanelOpen, setSidePanelOpen] = useState(false);

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

		return customers.filter((customer) => {
			if (typeFilter !== "all" && customer.customerType !== typeFilter) {
				return false;
			}

			if (statusFilter !== "all") {
				const activeStatus = statusFilter === "active";
				if (customer.isActive !== activeStatus) return false;
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
	}, [customers, search, typeFilter, statusFilter]);

	const handleSelectCustomer = (customerId: string) => {
		setSelectedCustomerId(customerId);
		setSidePanelOpen(true);
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

				<div className="mx-2 rounded-xl border border-background-secondary bg-background-primary p-3 flex flex-col gap-3">
					<div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:justify-between">
						<div className="relative w-full lg:max-w-md">
							<Search className="w-4 h-4 text-text-tertiary absolute left-3 top-1/2 -translate-y-1/2" />
							<input
								type="text"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Search name, company, phone, or location"
								className="w-full rounded-lg border border-background-secondary bg-background-main pl-9 pr-3 py-2 text-sm text-text-main placeholder:text-text-tertiary focus:outline-none focus:border-accent-main/50"
							/>
						</div>

						<div className="flex items-center gap-2 flex-wrap">
							<div className="inline-flex items-center gap-2 text-xs text-text-tertiary">
								<Filter className="w-3 h-3" />
								Filters
							</div>
							<select
								value={typeFilter}
								onChange={(event) =>
									setTypeFilter(event.target.value as typeof typeFilter)
								}
								className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs text-text-main"
							>
								<option value="all">All Types</option>
								<option value="residential">Residential</option>
								<option value="commercial">Commercial</option>
							</select>
							<select
								value={statusFilter}
								onChange={(event) =>
									setStatusFilter(event.target.value as typeof statusFilter)
								}
								className="rounded-lg border border-background-secondary bg-background-main px-2.5 py-2 text-xs text-text-main"
							>
								<option value="all">All Statuses</option>
								<option value="active">Active</option>
								<option value="inactive">Inactive</option>
							</select>
							<button
								onClick={() => {
									setSearch("");
									setTypeFilter("all");
									setStatusFilter("all");
								}}
								className="rounded-lg border border-background-secondary px-2.5 py-2 text-xs text-text-secondary hover:bg-background-secondary transition-colors"
							>
								Clear
							</button>
						</div>
					</div>

					<div className="text-xs text-text-tertiary px-1">
						Showing {filteredCustomers.length} of {customers.length} customers
					</div>
				</div>

				<div
					className={cn(
						"mx-2 w-full bg-background-primary rounded-xl border border-background-secondary relative pt-12"
					)}
				>
					<div className="border-b border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_1fr_1.5rem]">
						{["Name", "Type", "Phone", "Address", "Status", "Since", ""].map(
							(col) => (
								<p key={col} className="text-sm font-medium text-foreground/60">
									{col}
								</p>
							)
						)}
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
						{filteredCustomers.map((c) => (
							<li
								key={c.id}
								className={cn(
									"grid grid-cols-[1.3fr_1fr_1fr_1.2fr_1fr_1fr_1.5rem] items-center px-4 py-3 cursor-pointer hover:bg-background-secondary/30 rounded-lg transition-colors",
									selectedCustomerId === c.id && "bg-accent-main/10"
								)}
								onClick={() => handleSelectCustomer(c.id)}
							>
								<p className="text-sm font-medium truncate">
									{c.firstName} {c.lastName}
								</p>
								<p className="text-sm capitalize text-text-secondary">
									{c.customerType}
								</p>
								<p className="text-sm text-text-secondary">{c.phone}</p>
								<p className="text-sm text-text-secondary truncate">
									{c.city}, {c.state}
								</p>
								<CustomerStatusBadge active={c.isActive} />
								<p className="text-xs text-text-tertiary">
									{formatReadableDate(c.createdAt)} (
									{formatRelativeTime(c.createdAt)})
								</p>
								<ChevronRight className="w-4 h-4 text-text-tertiary" />
							</li>
						))}
					</ul>
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
						router.push(`/customers/${selectedCustomerId}`);
						setSidePanelOpen(false);
					}}
				/>
			</SidePanel>
		</>
	);
}
