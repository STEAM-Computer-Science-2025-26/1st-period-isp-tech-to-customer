"use client";

import Header from "@/components/layout/Header";
import MainContent from "@/components/layout/MainContent";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import { useParams, useRouter } from "next/navigation";
import {
	Phone,
	Mail,
	MapPin,
	AlertCircle,
	CheckCircle2,
	XCircle,
	ArrowLeft,
	Wrench,
	Calendar,
	MessageSquare,
	LayoutGrid,
	ChevronRight
} from "lucide-react";

const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";

// ─── Types ───────────────────────────────────────────────────────────────────

type Customer = {
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

type Location = {
	id: string;
	label: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	isPrimary: boolean;
	hasPets: boolean;
	gateCode?: string;
	accessNotes?: string;
	geocodingStatus?: string;
};

type Equipment = {
	id: string;
	equipmentType: string;
	manufacturer: string;
	modelNumber: string;
	serialNumber: string;
	installDate?: string;
	warrantyExpiry?: string;
	lastServiceDate?: string;
	condition?: string;
	refrigerantType?: string;
	ageYears?: number;
};

type Job = {
	id: string;
	jobType: string;
	status: string;
	priority: string;
	assignedTechId?: string;
	scheduledTime?: string;
	completedAt?: string;
	address?: string;
};

type Communication = {
	id: string;
	direction: string;
	channel: string;
	summary: string;
	jobId?: string;
	performedBy?: string;
	createdAt: string;
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getToken() {
	return (
		localStorage.getItem("authToken") ??
		localStorage.getItem("token") ??
		localStorage.getItem("jwt")
	);
}

function initials(first: string, last: string) {
	return `${first[0] ?? ""}${last[0] ?? ""}`.toUpperCase();
}

function formatDate(iso?: string) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function StatusBadge({ active }: { active: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium",
				active
					? "bg-success/15 text-success-text border border-success/25"
					: "bg-background-secondary text-text-tertiary border border-background-secondary"
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

function TypeBadge({ type }: { type: string }) {
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-main/10 text-accent-text border border-accent-main/20 capitalize">
			{type}
		</span>
	);
}

function JobStatusBadge({ status }: { status: string }) {
	const map: Record<string, string> = {
		completed: "text-success-text bg-success/10 border-success/20",
		cancelled: "text-error-text bg-error/10 border-error/20",
		in_progress: "text-info-text bg-info/10 border-info/20",
		assigned: "text-warning-text bg-warning/10 border-warning/20",
		unassigned:
			"text-text-tertiary bg-background-secondary border-background-secondary"
	};
	const icon: Record<string, React.ReactNode> = {
		completed: <CheckCircle2 className="w-3 h-3" />,
		cancelled: <XCircle className="w-3 h-3" />
	};
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border capitalize",
				map[status] ?? "text-text-tertiary bg-background-secondary"
			)}
		>
			{icon[status]}
			{status.replace("_", " ")}
		</span>
	);
}

function PriorityBadge({ priority }: { priority: string }) {
	const map: Record<string, string> = {
		emergency: "text-error-text",
		high: "text-warning-text",
		medium: "text-accent-text",
		low: "text-text-secondary"
	};
	return (
		<span
			className={cn(
				"text-xs font-medium capitalize",
				map[priority] ?? "text-text-secondary"
			)}
		>
			{priority}
		</span>
	);
}

function KpiMini({
	label,
	value,
	sub
}: {
	label: string;
	value: string | number;
	sub?: string;
}) {
	return (
		<div className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-1">
			<p className="text-xs text-text-tertiary uppercase tracking-wide font-medium">
				{label}
			</p>
			<p className="text-3xl font-semibold text-text-main">{value}</p>
			{sub && <p className="text-xs text-text-secondary">{sub}</p>}
		</div>
	);
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

type Tab = "overview" | "jobs" | "equipment" | "locations" | "communications";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
	{
		id: "overview",
		label: "Overview",
		icon: <LayoutGrid className="w-4 h-4" />
	},
	{ id: "jobs", label: "Job History", icon: <Calendar className="w-4 h-4" /> },
	{ id: "equipment", label: "Equipment", icon: <Wrench className="w-4 h-4" /> },
	{ id: "locations", label: "Locations", icon: <MapPin className="w-4 h-4" /> },
	{
		id: "communications",
		label: "Communications",
		icon: <MessageSquare className="w-4 h-4" />
	}
];

// ─── Tab Content ─────────────────────────────────────────────────────────────

function OverviewTab({
	customer,
	jobs,
	equipment
}: {
	customer: Customer;
	jobs: Job[];
	equipment: Equipment[];
}) {
	const lastJob = jobs[0];
	const alertEquipment = equipment.find(
		(e) => e.ageYears && e.ageYears >= 10 && e.condition !== "excellent"
	);

	return (
		<div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
			{/* Contact Info */}
			<div className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-4">
				<div className="flex items-center justify-between">
					<h3 className="text-sm font-semibold text-text-main">
						Contact Information
					</h3>
					<button className="text-xs text-accent-text hover:underline">
						Edit
					</button>
				</div>
				<div className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							First Name
						</p>
						<p className="text-text-main">{customer.firstName}</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Last Name
						</p>
						<p className="text-text-main">{customer.lastName}</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Primary Phone
						</p>
						<p className="text-text-main">{customer.phone}</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Alt Phone
						</p>
						<p className="text-text-main">{customer.altPhone ?? "—"}</p>
					</div>
					<div className="col-span-2">
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Email
						</p>
						<p className="text-text-main">{customer.email}</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Type
						</p>
						<TypeBadge type={customer.customerType} />
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Status
						</p>
						<StatusBadge active={customer.isActive} />
					</div>
					<div className="col-span-2">
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Primary Address
						</p>
						<p className="text-text-main">
							{customer.address}, {customer.city}, {customer.state}{" "}
							{customer.zip}
						</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Member Since
						</p>
						<p className="text-text-main">{formatDate(customer.createdAt)}</p>
					</div>
					<div>
						<p className="text-xs text-text-tertiary uppercase tracking-wide mb-0.5">
							Customer ID
						</p>
						<p className="text-text-tertiary font-mono text-xs">
							{customer.id.split("-")[0]}...
						</p>
					</div>
				</div>
			</div>

			{/* Right column */}
			<div className="flex flex-col gap-4">
				{/* Most Recent Job */}
				{lastJob && (
					<div className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-text-main">
								Most Recent Job
							</h3>
							<button className="text-xs text-accent-text hover:underline">
								View All
							</button>
						</div>
						<p className="text-sm font-medium text-text-main capitalize">
							{lastJob.jobType.replace("_", " ")}
						</p>
						<p className="text-xs text-text-secondary">
							{formatDate(lastJob.completedAt ?? lastJob.scheduledTime)}
						</p>
						<JobStatusBadge status={lastJob.status} />
					</div>
				)}

				{/* Equipment Alert */}
				{alertEquipment && (
					<div className="bg-warning/5 rounded-xl border border-warning/25 p-5 flex flex-col gap-2">
						<div className="flex items-center gap-2 text-warning-text">
							<AlertCircle className="w-4 h-4" />
							<h3 className="text-sm font-semibold">Equipment Alert</h3>
							<span className="ml-auto text-xs bg-warning/15 px-2 py-0.5 rounded-full border border-warning/25">
								Replacement Priority
							</span>
						</div>
						<p className="text-sm font-medium text-text-main">
							{alertEquipment.manufacturer} {alertEquipment.modelNumber}
						</p>
						<p className="text-xs text-text-secondary">
							Unit is{" "}
							<span className="text-warning-text font-medium">
								{alertEquipment.ageYears} years old
							</span>{" "}
							— past recommended replacement window. Condition rated{" "}
							<span className="capitalize text-text-main">
								{alertEquipment.condition ?? "unknown"}
							</span>
							.
						</p>
					</div>
				)}

				{/* Notes */}
				{customer.notes && (
					<div className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-2">
						<div className="flex items-center justify-between">
							<h3 className="text-sm font-semibold text-text-main">
								Customer Notes
							</h3>
							<button className="text-xs text-accent-text hover:underline">
								Edit Notes
							</button>
						</div>
						<p className="text-sm text-text-secondary leading-relaxed">
							{customer.notes}
						</p>
					</div>
				)}
			</div>
		</div>
	);
}

function JobHistoryTab({ jobs }: { jobs: Job[] }) {
	return (
		<div className="bg-background-primary rounded-xl border border-background-secondary overflow-hidden">
			<div className="flex items-center justify-between px-5 py-4 border-b border-background-secondary">
				<h3 className="text-sm font-semibold text-text-main">
					Job History ({jobs.length} total)
				</h3>
				<button className="text-xs bg-accent-main text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
					+ Create New Job
				</button>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-background-secondary">
							{[
								"Job ID",
								"Type",
								"Status",
								"Priority",
								"Scheduled",
								"Completed"
							].map((h) => (
								<th
									key={h}
									className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wide"
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-background-secondary/50">
						{jobs.map((j) => (
							<tr
								key={j.id}
								className="hover:bg-background-secondary/30 transition-colors"
							>
								<td className="px-5 py-3 font-mono text-xs text-text-tertiary">
									{j.id.split("-")[0]}...
								</td>
								<td className="px-5 py-3 capitalize">
									{j.jobType.replace("_", " ")}
								</td>
								<td className="px-5 py-3">
									<JobStatusBadge status={j.status} />
								</td>
								<td className="px-5 py-3">
									<PriorityBadge priority={j.priority} />
								</td>
								<td className="px-5 py-3 text-text-secondary">
									{formatDate(j.scheduledTime)}
								</td>
								<td className="px-5 py-3 text-text-secondary">
									{formatDate(j.completedAt)}
								</td>
							</tr>
						))}
						{jobs.length === 0 && (
							<tr>
								<td
									colSpan={6}
									className="px-5 py-8 text-center text-text-tertiary text-xs"
								>
									No jobs yet
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function EquipmentTab({ equipment }: { equipment: Equipment[] }) {
	return (
		<div className="bg-background-primary rounded-xl border border-background-secondary overflow-hidden">
			<div className="flex items-center justify-between px-5 py-4 border-b border-background-secondary">
				<h3 className="text-sm font-semibold text-text-main">
					Equipment — {equipment.length} units
				</h3>
				<button className="text-xs bg-accent-main text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
					+ Add Equipment
				</button>
			</div>
			<div className="overflow-x-auto">
				<table className="w-full text-sm">
					<thead>
						<tr className="border-b border-background-secondary">
							{[
								"Type",
								"Manufacturer / Model",
								"Serial #",
								"Installed",
								"Age",
								"Condition",
								"Last Service",
								"Warranty",
								"Refrigerant"
							].map((h) => (
								<th
									key={h}
									className="px-5 py-3 text-left text-xs font-medium text-text-tertiary uppercase tracking-wide whitespace-nowrap"
								>
									{h}
								</th>
							))}
						</tr>
					</thead>
					<tbody className="divide-y divide-background-secondary/50">
						{equipment.map((e) => {
							const isOld = (e.ageYears ?? 0) >= 10;
							const warrantyExpired =
								e.warrantyExpiry && new Date(e.warrantyExpiry) < new Date();
							return (
								<tr
									key={e.id}
									className="hover:bg-background-secondary/30 transition-colors"
								>
									<td className="px-5 py-3 font-medium capitalize">
										{e.equipmentType.replace("_", " ")}
									</td>
									<td className="px-5 py-3 text-text-secondary">
										{e.manufacturer} · {e.modelNumber}
									</td>
									<td className="px-5 py-3 font-mono text-xs text-text-tertiary">
										{e.serialNumber}
									</td>
									<td className="px-5 py-3 text-text-secondary">
										{formatDate(e.installDate)}
									</td>
									<td
										className={cn(
											"px-5 py-3",
											isOld
												? "text-warning-text font-medium"
												: "text-text-secondary"
										)}
									>
										{e.ageYears != null
											? `${e.ageYears} yrs${isOld ? " ⚠" : ""}`
											: "—"}
									</td>
									<td
										className={cn(
											"px-5 py-3 capitalize font-medium",
											e.condition === "excellent"
												? "text-success-text"
												: e.condition === "good"
													? "text-info-text"
													: e.condition === "fair"
														? "text-warning-text"
														: "text-text-secondary"
										)}
									>
										{e.condition ?? "—"}
									</td>
									<td className="px-5 py-3 text-text-secondary">
										{formatDate(e.lastServiceDate)}
									</td>
									<td
										className={cn(
											"px-5 py-3",
											warrantyExpired ? "text-error-text" : "text-success-text"
										)}
									>
										{e.warrantyExpiry
											? warrantyExpired
												? "Expired"
												: formatDate(e.warrantyExpiry)
											: "—"}
									</td>
									<td className="px-5 py-3 text-text-secondary">
										{e.refrigerantType ?? "—"}
									</td>
								</tr>
							);
						})}
						{equipment.length === 0 && (
							<tr>
								<td
									colSpan={9}
									className="px-5 py-8 text-center text-text-tertiary text-xs"
								>
									No equipment on file
								</td>
							</tr>
						)}
					</tbody>
				</table>
			</div>
		</div>
	);
}

function LocationsTab({ locations }: { locations: Location[] }) {
	return (
		<div className="flex flex-col gap-3">
			<div className="flex items-center justify-between">
				<h3 className="text-sm font-semibold text-text-main">
					Service Locations ({locations.length})
				</h3>
				<button className="text-xs bg-accent-main text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
					+ Add Location
				</button>
			</div>
			{locations.map((loc) => (
				<div
					key={loc.id}
					className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-2"
				>
					<div className="flex items-center gap-2">
						<span className="text-sm font-semibold text-text-main">
							{loc.label}
						</span>
						{loc.isPrimary ? (
							<span className="text-xs bg-accent-main/10 text-accent-text border border-accent-main/20 px-2 py-0.5 rounded-full">
								Primary
							</span>
						) : (
							<span className="text-xs bg-background-secondary text-text-tertiary px-2 py-0.5 rounded-full">
								Secondary
							</span>
						)}
					</div>
					<div className="flex items-center gap-1.5 text-sm text-text-secondary">
						<MapPin className="w-3.5 h-3.5 shrink-0" />
						{loc.address}, {loc.city}, {loc.state} {loc.zip}
					</div>
					<div className="flex flex-wrap gap-4 text-xs text-text-secondary mt-1">
						{loc.gateCode && (
							<span>
								Gate code:{" "}
								<strong className="text-text-main">{loc.gateCode}</strong>
							</span>
						)}
						<span>
							Has pets:{" "}
							<strong className="text-text-main">
								{loc.hasPets ? "Yes" : "No"}
							</strong>
						</span>
						{loc.accessNotes && (
							<span>
								Access:{" "}
								<strong className="text-text-main">{loc.accessNotes}</strong>
							</span>
						)}
						{loc.geocodingStatus && (
							<span className="flex items-center gap-1">
								<CheckCircle2 className="w-3 h-3 text-success-text" />
								Geocoded:{" "}
								<strong className="text-success-text capitalize">
									{loc.geocodingStatus}
								</strong>
							</span>
						)}
					</div>
				</div>
			))}
			{locations.length === 0 && (
				<div className="bg-background-primary rounded-xl border border-background-secondary p-8 text-center text-text-tertiary text-xs">
					No locations on file
				</div>
			)}
		</div>
	);
}

const CHANNEL_ICON: Record<string, React.ReactNode> = {
	phone: <Phone className="w-4 h-4" />,
	email: <Mail className="w-4 h-4" />,
	sms: <MessageSquare className="w-4 h-4" />,
	"in-person": <ChevronRight className="w-4 h-4" />
};

function CommunicationsTab({
	communications
}: {
	communications: Communication[];
}) {
	return (
		<div className="bg-background-primary rounded-xl border border-background-secondary overflow-hidden">
			<div className="flex items-center justify-between px-5 py-4 border-b border-background-secondary">
				<h3 className="text-sm font-semibold text-text-main">
					Communication Log ({communications.length} entries)
				</h3>
				<button className="text-xs bg-accent-main text-white px-3 py-1.5 rounded-lg hover:opacity-90 transition-opacity">
					+ Log Interaction
				</button>
			</div>
			<div className="divide-y divide-background-secondary/50">
				{communications.map((c) => (
					<div
						key={c.id}
						className="px-5 py-4 flex gap-4 hover:bg-background-secondary/20 transition-colors"
					>
						<div
							className={cn(
								"w-9 h-9 rounded-full flex items-center justify-center shrink-0 mt-0.5",
								c.direction === "inbound"
									? "bg-info/10 text-info-text"
									: "bg-accent-main/10 text-accent-text"
							)}
						>
							{CHANNEL_ICON[c.channel] ?? <MessageSquare className="w-4 h-4" />}
						</div>
						<div className="flex-1 min-w-0">
							<div className="flex items-center gap-2 mb-1 flex-wrap">
								<span
									className={cn(
										"text-xs font-semibold uppercase tracking-wide",
										c.direction === "inbound"
											? "text-info-text"
											: "text-accent-text"
									)}
								>
									{c.direction === "inbound" ? "↓" : "↑"} {c.direction}
								</span>
								<span className="text-xs text-text-tertiary">·</span>
								<span className="text-xs text-text-tertiary capitalize">
									{c.channel}
								</span>
								{c.performedBy && (
									<>
										<span className="text-xs text-text-tertiary">·</span>
										<span className="text-xs text-text-tertiary">
											{c.performedBy}
										</span>
									</>
								)}
							</div>
							<p className="text-sm text-text-main leading-snug">{c.summary}</p>
							{c.jobId && (
								<p className="text-xs text-text-tertiary mt-1">
									Linked to:{" "}
									<span className="font-mono">{c.jobId.split("-")[0]}...</span>
								</p>
							)}
						</div>
						<div className="text-xs text-text-tertiary shrink-0 text-right whitespace-nowrap">
							{formatDate(c.createdAt)}
						</div>
					</div>
				))}
				{communications.length === 0 && (
					<div className="px-5 py-8 text-center text-text-tertiary text-xs">
						No communications logged
					</div>
				)}
			</div>
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CustomerDetailPage() {
	const params = useParams();
	const router = useRouter();
	const customerId = params.customerId as string;

	const [customer, setCustomer] = useState<Customer | null>(null);
	const [locations, setLocations] = useState<Location[]>([]);
	const [equipment, setEquipment] = useState<Equipment[]>([]);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [communications, setCommunications] = useState<Communication[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	useEffect(() => {
		if (!customerId) return;
		let mounted = true;
		setLoading(true);

		void (async () => {
			try {
				const token = getToken();
				const headers: HeadersInit = token
					? { Authorization: `Bearer ${token}` }
					: {};
				const res = await fetch(`${FASTIFY_BASE_URL}/customers/${customerId}`, {
					headers
				});
				if (!res.ok) throw new Error(`Customer not found (${res.status})`);
				const data = (await res.json()) as {
					customer: Customer;
					locations: Location[];
					equipment: Equipment[];
					jobs: Job[];
					communications: Communication[];
				};
				if (mounted) {
					setCustomer(data.customer);
					setLocations(data.locations ?? []);
					setEquipment(data.equipment ?? []);
					setJobs(data.jobs ?? []);
					setCommunications(data.communications ?? []);
				}
			} catch (e) {
				if (mounted)
					setError(e instanceof Error ? e.message : "Failed to load customer");
			} finally {
				if (mounted) setLoading(false);
			}
		})();

		return () => {
			mounted = false;
		};
	}, [customerId]);

	const tabs = TABS.map((t) => {
		const count =
			t.id === "jobs"
				? jobs.length
				: t.id === "equipment"
					? equipment.length
					: t.id === "locations"
						? locations.length
						: t.id === "communications"
							? communications.length
							: null;
		return { ...t, count };
	});

	return (
		<>
			<Header
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				onMobileMenuClick={() => setMobileSidebarOpen((o) => !o)}
				mobileMenuOpen={mobileSidebarOpen}
			/>
			<MainContent
				sidebarAutoCollapse={sidebarAutoCollapse}
				sidebarIsStrip={sidebarIsStrip}
				className={cn("flex flex-col gap-4")}
			>
				{/* Breadcrumb */}
				<div className="flex items-center gap-2 text-sm text-text-tertiary px-1">
					<button
						onClick={() => router.push("/customers")}
						className="hover:text-text-main flex items-center gap-1 transition-colors"
					>
						<ArrowLeft className="w-3.5 h-3.5" /> Customers
					</button>
					<ChevronRight className="w-3.5 h-3.5" />
					<span className="text-text-main">
						{customer ? `${customer.firstName} ${customer.lastName}` : "..."}
					</span>
				</div>

				{loading && (
					<div className="flex items-center justify-center py-20 text-text-tertiary text-sm">
						Loading customer...
					</div>
				)}

				{error && (
					<div className="mx-2 p-4 bg-error/10 border border-error/25 rounded-xl text-sm text-error-text">
						{error}
					</div>
				)}

				{customer && (
					<>
						{/* Header Card */}
						<div className="bg-background-primary rounded-xl border border-background-secondary p-5 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
							<div className="flex items-center gap-4">
								{/* Avatar */}
								<div className="w-14 h-14 rounded-xl bg-accent-main/20 text-accent-text flex items-center justify-center text-lg font-bold shrink-0">
									{initials(customer.firstName, customer.lastName)}
								</div>
								<div className="flex flex-col gap-1">
									<div className="flex items-center gap-2 flex-wrap">
										<h1 className="text-lg font-semibold text-text-main">
											{customer.firstName} {customer.lastName}
										</h1>
										<StatusBadge active={customer.isActive} />
										<TypeBadge type={customer.customerType} />
									</div>
									<p className="text-xs text-text-tertiary">
										Customer since {formatDate(customer.createdAt)} ·{" "}
										<span className="font-mono">
											{customer.id.split("-")[0]}...
										</span>
									</p>
									<div className="flex items-center gap-4 text-xs text-text-secondary mt-0.5 flex-wrap">
										<span className="flex items-center gap-1">
											<Phone className="w-3 h-3" />
											{customer.phone}
										</span>
										<span className="flex items-center gap-1">
											<Mail className="w-3 h-3" />
											{customer.email}
										</span>
										<span className="flex items-center gap-1">
											<MapPin className="w-3 h-3" />
											{customer.address}, {customer.city}, {customer.state}{" "}
											{customer.zip}
										</span>
									</div>
								</div>
							</div>
							<div className="flex flex-col gap-2 items-end shrink-0">
								{customer.noShowCount > 0 && (
									<button className="flex items-center gap-1.5 text-xs text-error-text border border-error/25 bg-error/5 px-3 py-1.5 rounded-lg hover:bg-error/10 transition-colors">
										<AlertCircle className="w-3.5 h-3.5" />
										{customer.noShowCount} No-Show
										{customer.noShowCount > 1 ? "s" : ""} on Record
									</button>
								)}
								<button className="flex items-center gap-1.5 text-xs text-text-secondary border border-background-secondary px-3 py-1.5 rounded-lg hover:bg-background-secondary transition-colors">
									Log No-Show
								</button>
							</div>
						</div>

						{/* KPI Cards */}
						<div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
							<KpiMini
								label="Total Jobs"
								value={jobs.length}
								sub={`${jobs.filter((j) => j.status === "completed").length} completed`}
							/>
							<KpiMini
								label="Equipment Units"
								value={equipment.length}
								sub={
									equipment.filter((e) => (e.ageYears ?? 0) >= 10).length > 0
										? `${equipment.filter((e) => (e.ageYears ?? 0) >= 10).length} needs attention`
										: "All good"
								}
							/>
							<KpiMini label="No-Shows" value={customer.noShowCount} />
							<KpiMini
								label="Last Service"
								value={
									jobs[0]?.completedAt
										? new Date(jobs[0].completedAt).toLocaleDateString(
												"en-US",
												{ month: "short", day: "numeric", year: "numeric" }
											)
										: "—"
								}
								sub={jobs[0]?.jobType?.replace("_", " ")}
							/>
						</div>

						{/* Tabs */}
						<div className="flex items-center gap-1 border-b border-background-secondary overflow-x-auto no-scrollbar">
							{tabs.map((t) => (
								<button
									key={t.id}
									onClick={() => setActiveTab(t.id)}
									className={cn(
										"flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
										activeTab === t.id
											? "border-accent-main text-accent-text"
											: "border-transparent text-text-secondary hover:text-text-main"
									)}
								>
									{t.icon}
									{t.label}
									{t.count != null && t.count > 0 && (
										<span
											className={cn(
												"text-xs px-1.5 py-0.5 rounded-full min-w-[1.25rem] text-center",
												activeTab === t.id
													? "bg-accent-main/15 text-accent-text"
													: "bg-background-secondary text-text-tertiary"
											)}
										>
											{t.count}
										</span>
									)}
								</button>
							))}
						</div>

						{/* Tab Content */}
						<div className="pb-8">
							{activeTab === "overview" && (
								<OverviewTab
									customer={customer}
									jobs={jobs}
									equipment={equipment}
								/>
							)}
							{activeTab === "jobs" && <JobHistoryTab jobs={jobs} />}
							{activeTab === "equipment" && (
								<EquipmentTab equipment={equipment} />
							)}
							{activeTab === "locations" && (
								<LocationsTab locations={locations} />
							)}
							{activeTab === "communications" && (
								<CommunicationsTab communications={communications} />
							)}
						</div>
					</>
				)}
			</MainContent>
			<Sidebar
				title="Tech to Customer"
				autoCollapse={false}
				items={defaultSidebarItems}
				mobileOpen={mobileSidebarOpen}
				onMobileOpenChange={setMobileSidebarOpen}
				hideMobileToggleButton
				onFlagsChange={({ autoCollapse, isStrip }) => {
					setSidebarAutoCollapse(autoCollapse);
					setSidebarIsStrip(isStrip);
				}}
			/>
		</>
	);
}
