"use client";

import Header from "@/components/layout/Header";
import MainContent from "@/components/layout/MainContent";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import { useParams, useRouter } from "next/navigation";
import {
	ArrowLeft,
	Phone,
	Mail,
	MapPin,
	Star,
	Wrench,
	CheckCircle2,
	XCircle,
	Briefcase,
	Clock,
	AlertCircle,
	ToggleLeft,
	ToggleRight,
	ChevronRight
} from "lucide-react";

const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";

// ─── Types ────────────────────────────────────────────────────────────────────

type EmployeeSkill =
	| "hvac_install"
	| "hvac_repair"
	| "hvac_maintenance"
	| "electrical"
	| "refrigeration"
	| "ductwork"
	| "plumbing";

type Employee = {
	id: string;
	userId: string;
	companyId: string;
	name: string;
	email: string | null;
	role: string | null;
	phone: string | null;
	skills: EmployeeSkill[];
	skillLevel: Partial<Record<EmployeeSkill, number>>;
	homeAddress: string;
	isAvailable: boolean;
	isActive: boolean;
	rating: number;
	currentJobId: string | null;
	maxConcurrentJobs: number;
	currentJobsCount?: number;
	latitude: number | null;
	longitude: number | null;
	internalNotes: string | null;
	lastJobCompletedAt: string | null;
	createdAt: string;
};

type Job = {
	id: string;
	jobType: string;
	status: string;
	priority: string;
	customerName: string;
	address: string;
	scheduledTime?: string;
	completedAt?: string;
};

type Tab = "overview" | "jobs";

// ─── Constants ────────────────────────────────────────────────────────────────

const SKILL_LABELS: Record<EmployeeSkill, string> = {
	hvac_install: "HVAC Install",
	hvac_repair: "HVAC Repair",
	hvac_maintenance: "HVAC Maintenance",
	electrical: "Electrical",
	refrigeration: "Refrigeration",
	ductwork: "Ductwork",
	plumbing: "Plumbing"
};

const SKILL_LEVEL_LABELS: Record<number, string> = {
	1: "Junior",
	2: "Mid",
	3: "Senior"
};

const STATUS_COLORS: Record<string, string> = {
	unassigned:
		"bg-background-secondary text-text-tertiary border-background-secondary",
	assigned: "bg-info/10 text-info-text border-info/25",
	in_progress: "bg-accent-main/10 text-accent-text border-accent-main/25",
	completed: "bg-success/10 text-success-text border-success/25",
	cancelled: "bg-error/10 text-error-text border-error/25"
};

const PRIORITY_COLORS: Record<string, string> = {
	low: "text-text-tertiary",
	medium: "text-accent-text",
	high: "text-warning-text",
	emergency: "text-error-text"
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getToken() {
	return (
		localStorage.getItem("authToken") ??
		localStorage.getItem("token") ??
		localStorage.getItem("jwt")
	);
}

function initials(name: string) {
	return name
		.split(" ")
		.map((w) => w[0] ?? "")
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

function formatDate(iso?: string | null) {
	if (!iso) return "—";
	return new Date(iso).toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}

function formatDateTime(iso?: string | null) {
	if (!iso) return "—";
	return new Date(iso).toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function AvailabilityBadge({ available }: { available: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border",
				available
					? "bg-success/10 text-success-text border-success/25"
					: "bg-background-secondary text-text-tertiary border-background-secondary"
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full shrink-0",
					available ? "bg-success-text animate-pulse" : "bg-text-tertiary"
				)}
			/>
			{available ? "Available" : "Unavailable"}
		</span>
	);
}

function SkillBadge({
	skill,
	level
}: {
	skill: EmployeeSkill;
	level?: number;
}) {
	return (
		<div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent-main/8 border border-accent-main/15">
			<Wrench className="w-3 h-3 text-accent-text shrink-0" />
			<span className="text-xs font-medium text-accent-text">
				{SKILL_LABELS[skill]}
			</span>
			{level && (
				<span className="text-xs text-text-tertiary ml-0.5">
					· {SKILL_LEVEL_LABELS[level] ?? `Lv.${level}`}
				</span>
			)}
		</div>
	);
}

function StarRating({ rating }: { rating: number }) {
	return (
		<div className="flex items-center gap-1.5">
			{[1, 2, 3, 4, 5].map((i) => (
				<Star
					key={i}
					className={cn(
						"w-4 h-4",
						i <= Math.round(rating)
							? "fill-warning-text text-warning-text"
							: "text-background-secondary fill-background-secondary"
					)}
				/>
			))}
			<span className="text-sm font-semibold text-text-main ml-1">
				{rating.toFixed(1)}
			</span>
		</div>
	);
}

function InfoRow({
	icon,
	label,
	value
}: {
	icon: React.ReactNode;
	label: string;
	value: React.ReactNode;
}) {
	return (
		<div className="flex items-start gap-3 py-3 border-b border-background-secondary/50 last:border-0">
			<div className="w-4 h-4 mt-0.5 text-text-tertiary shrink-0">{icon}</div>
			<div className="flex flex-col gap-0.5 min-w-0">
				<p className="text-xs text-text-tertiary uppercase tracking-wide font-medium">
					{label}
				</p>
				<div className="text-sm text-text-main">{value}</div>
			</div>
		</div>
	);
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function EmployeeDetailPage() {
	const params = useParams();
	const router = useRouter();
	const employeeId = params.employeeId as string;

	const [employee, setEmployee] = useState<Employee | null>(null);
	const [jobs, setJobs] = useState<Job[]>([]);
	const [loading, setLoading] = useState(true);
	const [error, setError] = useState<string | null>(null);
	const [activeTab, setActiveTab] = useState<Tab>("overview");
	const [toggling, setToggling] = useState(false);

	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

	useEffect(() => {
		if (!employeeId) return;
		let mounted = true;
		setLoading(true);

		void (async () => {
			try {
				const token = getToken();
				const headers: HeadersInit = token
					? { Authorization: `Bearer ${token}` }
					: {};

				const [empRes, jobsRes] = await Promise.allSettled([
					fetch(`${FASTIFY_BASE_URL}/employees/${employeeId}`, { headers }),
					fetch(`${FASTIFY_BASE_URL}/jobs?assignedTechId=${employeeId}`, {
						headers
					})
				]);

				if (empRes.status === "fulfilled") {
					if (!empRes.value.ok)
						throw new Error(`Employee not found (${empRes.value.status})`);
					const data = (await empRes.value.json()) as { employee?: Employee };
					if (mounted) setEmployee(data.employee ?? null);
				} else {
					throw empRes.reason;
				}

				if (jobsRes.status === "fulfilled" && jobsRes.value.ok) {
					const data = (await jobsRes.value.json()) as { jobs?: Job[] };
					if (mounted) setJobs(data.jobs ?? []);
				}
			} catch (e) {
				if (mounted)
					setError(e instanceof Error ? e.message : "Failed to load employee");
			} finally {
				if (mounted) setLoading(false);
			}
		})();

		return () => {
			mounted = false;
		};
	}, [employeeId]);

	const toggleAvailability = async () => {
		if (!employee) return;
		setToggling(true);
		try {
			const token = getToken();
			const res = await fetch(`${FASTIFY_BASE_URL}/employees/${employee.id}`, {
				method: "PATCH",
				headers: {
					"Content-Type": "application/json",
					...(token ? { Authorization: `Bearer ${token}` } : {})
				},
				body: JSON.stringify({ isAvailable: !employee.isAvailable })
			});
			if (!res.ok) throw new Error("Failed to update availability");
			const data = (await res.json()) as { employee?: Employee };
			if (data.employee) setEmployee(data.employee);
		} catch {
			// silently fail — badge stays as-is
		} finally {
			setToggling(false);
		}
	};

	const completedJobs = jobs.filter((j) => j.status === "completed");
	const activeJob = jobs.find(
		(j) => j.status === "in_progress" || j.status === "assigned"
	);

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
				className={cn("flex flex-col gap-4 pb-8")}
			>
				{/* Back nav */}
				<div className="mx-2 pt-1">
					<button
						onClick={() => router.push("/employees")}
						className="inline-flex items-center gap-1.5 text-sm text-text-tertiary hover:text-text-main transition-colors"
					>
						<ArrowLeft className="w-4 h-4" />
						All Employees
					</button>
				</div>

				{loading && (
					<div className="flex items-center justify-center py-24 text-text-tertiary text-sm">
						Loading employee...
					</div>
				)}

				{error && (
					<div className="mx-2 p-4 bg-error/10 border border-error/25 rounded-xl text-sm text-error-text flex items-center gap-2">
						<AlertCircle className="w-4 h-4 shrink-0" />
						{error}
					</div>
				)}

				{employee && (
					<>
						{/* ── Header Card ── */}
						<div className="mx-2 bg-background-primary rounded-xl border border-background-secondary p-5">
							<div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
								{/* Avatar + identity */}
								<div className="flex items-center gap-4">
									<div className="w-16 h-16 rounded-xl bg-accent-main/20 text-accent-text flex items-center justify-center text-xl font-bold shrink-0">
										{initials(employee.name)}
									</div>
									<div className="flex flex-col gap-1">
										<div className="flex items-center gap-2 flex-wrap">
											<h1 className="text-lg font-semibold text-text-main">
												{employee.name}
											</h1>
											{employee.isActive ? (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success-text border border-success/25">
													<CheckCircle2 className="w-3 h-3" /> Active
												</span>
											) : (
												<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-background-secondary text-text-tertiary border border-background-secondary">
													<XCircle className="w-3 h-3" /> Inactive
												</span>
											)}
											<AvailabilityBadge available={employee.isAvailable} />
										</div>
										{employee.role && (
											<p className="text-sm text-text-secondary capitalize">
												{employee.role}
											</p>
										)}
										<div className="flex items-center gap-4 text-xs text-text-tertiary mt-0.5 flex-wrap">
											{employee.phone && (
												<span className="flex items-center gap-1">
													<Phone className="w-3 h-3" />
													{employee.phone}
												</span>
											)}
											{employee.email && (
												<span className="flex items-center gap-1">
													<Mail className="w-3 h-3" />
													{employee.email}
												</span>
											)}
											<span className="flex items-center gap-1">
												<Clock className="w-3 h-3" />
												Since {formatDate(employee.createdAt)}
											</span>
										</div>
									</div>
								</div>

								{/* Actions */}
								<div className="flex flex-col gap-2 items-start sm:items-end shrink-0">
									<StarRating rating={employee.rating} />
									<button
										onClick={toggleAvailability}
										disabled={toggling}
										className={cn(
											"inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all",
											employee.isAvailable
												? "bg-success/10 text-success-text border-success/25 hover:bg-success/20"
												: "bg-background-secondary text-text-secondary border-background-secondary hover:bg-background-secondary/80",
											toggling && "opacity-50 cursor-not-allowed"
										)}
									>
										{employee.isAvailable ? (
											<ToggleRight className="w-4 h-4" />
										) : (
											<ToggleLeft className="w-4 h-4" />
										)}
										{toggling
											? "Updating..."
											: employee.isAvailable
												? "Mark Unavailable"
												: "Mark Available"}
									</button>
								</div>
							</div>

							{/* Stats row */}
							<div className="mt-4 pt-4 border-t border-background-secondary grid grid-cols-2 sm:grid-cols-4 gap-4">
								<div className="flex flex-col gap-0.5">
									<p className="text-xs text-text-tertiary uppercase tracking-wide">
										Completed Jobs
									</p>
									<p className="text-lg font-semibold text-text-main">
										{completedJobs.length}
									</p>
								</div>
								<div className="flex flex-col gap-0.5">
									<p className="text-xs text-text-tertiary uppercase tracking-wide">
										Current Jobs
									</p>
									<p className="text-lg font-semibold text-text-main">
										{employee.currentJobsCount ??
											(employee.currentJobId ? 1 : 0)}
										<span className="text-xs text-text-tertiary font-normal">
											/{employee.maxConcurrentJobs}
										</span>
									</p>
								</div>
								<div className="flex flex-col gap-0.5">
									<p className="text-xs text-text-tertiary uppercase tracking-wide">
										Skills
									</p>
									<p className="text-lg font-semibold text-text-main">
										{employee.skills.length}
									</p>
								</div>
								<div className="flex flex-col gap-0.5">
									<p className="text-xs text-text-tertiary uppercase tracking-wide">
										Last Job
									</p>
									<p className="text-sm font-medium text-text-main">
										{formatDate(employee.lastJobCompletedAt)}
									</p>
								</div>
							</div>
						</div>

						{/* ── Tabs ── */}
						<div className="mx-2 flex gap-1 border-b border-background-secondary pb-0">
							{(["overview", "jobs"] as Tab[]).map((tab) => (
								<button
									key={tab}
									onClick={() => setActiveTab(tab)}
									className={cn(
										"px-4 py-2 text-sm font-medium capitalize rounded-t-lg transition-colors",
										activeTab === tab
											? "text-text-main border-b-2 border-accent-main -mb-px"
											: "text-text-tertiary hover:text-text-secondary"
									)}
								>
									{tab === "jobs" ? `Jobs (${jobs.length})` : tab}
								</button>
							))}
						</div>

						{/* ── Overview Tab ── */}
						{activeTab === "overview" && (
							<div className="mx-2 grid grid-cols-1 lg:grid-cols-2 gap-4">
								{/* Left: Contact & details */}
								<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
									<h3 className="text-sm font-semibold text-text-main mb-3">
										Details
									</h3>
									<InfoRow
										icon={<MapPin className="w-4 h-4" />}
										label="Home Address"
										value={employee.homeAddress}
									/>
									{employee.phone && (
										<InfoRow
											icon={<Phone className="w-4 h-4" />}
											label="Phone"
											value={employee.phone}
										/>
									)}
									{employee.email && (
										<InfoRow
											icon={<Mail className="w-4 h-4" />}
											label="Email"
											value={employee.email}
										/>
									)}
									<InfoRow
										icon={<Briefcase className="w-4 h-4" />}
										label="Max Concurrent Jobs"
										value={employee.maxConcurrentJobs}
									/>
									{employee.latitude != null && employee.longitude != null && (
										<InfoRow
											icon={<MapPin className="w-4 h-4" />}
											label="Coordinates"
											value={
												<span className="font-mono text-xs text-text-secondary">
													{employee.latitude.toFixed(5)},{" "}
													{employee.longitude.toFixed(5)}
												</span>
											}
										/>
									)}
									<InfoRow
										icon={<Clock className="w-4 h-4" />}
										label="Member Since"
										value={formatDate(employee.createdAt)}
									/>
									<InfoRow
										icon={<Clock className="w-4 h-4" />}
										label="Last Job Completed"
										value={formatDateTime(employee.lastJobCompletedAt)}
									/>
								</div>

								{/* Right: Skills + notes */}
								<div className="flex flex-col gap-4">
									{/* Skills card */}
									<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
										<h3 className="text-sm font-semibold text-text-main mb-3">
											Skills
										</h3>
										{employee.skills.length === 0 ? (
											<p className="text-xs text-text-tertiary">
												No skills assigned.
											</p>
										) : (
											<div className="flex flex-wrap gap-2">
												{employee.skills.map((skill) => (
													<SkillBadge
														key={skill}
														skill={skill}
														level={employee.skillLevel[skill]}
													/>
												))}
											</div>
										)}
									</div>

									{/* Current job card */}
									{activeJob && (
										<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
											<div className="flex items-center justify-between mb-3">
												<h3 className="text-sm font-semibold text-text-main">
													Current Job
												</h3>
												<span
													className={cn(
														"text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
														STATUS_COLORS[activeJob.status] ??
															"bg-background-secondary text-text-tertiary border-background-secondary"
													)}
												>
													{activeJob.status.replace("_", " ")}
												</span>
											</div>
											<p className="text-sm font-medium text-text-main capitalize">
												{activeJob.jobType.replace("_", " ")}
											</p>
											<p className="text-xs text-text-secondary mt-0.5">
												{activeJob.customerName}
											</p>
											<p className="text-xs text-text-tertiary mt-0.5 flex items-center gap-1">
												<MapPin className="w-3 h-3 shrink-0" />
												{activeJob.address}
											</p>
											<button
												onClick={() => router.push(`/jobs/${activeJob.id}`)}
												className="mt-3 text-xs text-accent-text hover:underline flex items-center gap-1"
											>
												View job <ChevronRight className="w-3 h-3" />
											</button>
										</div>
									)}

									{/* Internal notes */}
									{employee.internalNotes && (
										<div className="bg-background-primary rounded-xl border border-background-secondary p-5">
											<h3 className="text-sm font-semibold text-text-main mb-2">
												Internal Notes
											</h3>
											<p className="text-sm text-text-secondary leading-relaxed whitespace-pre-wrap">
												{employee.internalNotes}
											</p>
										</div>
									)}
								</div>
							</div>
						)}

						{/* ── Jobs Tab ── */}
						{activeTab === "jobs" && (
							<div className="mx-2 bg-background-primary rounded-xl border border-background-secondary">
								{jobs.length === 0 ? (
									<div className="py-12 text-center text-sm text-text-tertiary">
										No jobs found for this employee.
									</div>
								) : (
									<ul className="divide-y divide-background-secondary/50">
										{jobs.map((job) => (
											<li
												key={job.id}
												className="flex items-center gap-4 px-5 py-4 hover:bg-background-secondary/20 cursor-pointer transition-colors"
												onClick={() => router.push(`/jobs/${job.id}`)}
											>
												<div className="flex-1 min-w-0">
													<div className="flex items-center gap-2 flex-wrap mb-0.5">
														<p className="text-sm font-medium text-text-main capitalize">
															{job.jobType.replace("_", " ")}
														</p>
														<span
															className={cn(
																"text-xs px-2 py-0.5 rounded-full border font-medium capitalize",
																STATUS_COLORS[job.status] ??
																	"bg-background-secondary text-text-tertiary border-background-secondary"
															)}
														>
															{job.status.replace("_", " ")}
														</span>
														<span
															className={cn(
																"text-xs font-medium capitalize",
																PRIORITY_COLORS[job.priority] ??
																	"text-text-tertiary"
															)}
														>
															{job.priority}
														</span>
													</div>
													<p className="text-xs text-text-secondary">
														{job.customerName}
													</p>
													<p className="text-xs text-text-tertiary flex items-center gap-1 mt-0.5">
														<MapPin className="w-3 h-3 shrink-0" />
														{job.address}
													</p>
												</div>
												<div className="text-right shrink-0">
													<p className="text-xs text-text-tertiary">
														{job.completedAt
															? formatDate(job.completedAt)
															: job.scheduledTime
																? formatDate(job.scheduledTime)
																: "—"}
													</p>
												</div>
												<ChevronRight className="w-4 h-4 text-text-tertiary shrink-0" />
											</li>
										))}
									</ul>
								)}
							</div>
						)}
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
