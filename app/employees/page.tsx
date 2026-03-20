"use client";

import MainContent from "@/components/layout/MainContent";
import { useState } from "react";
import { cn } from "@/lib/utils/index";
import { getToken } from "@/lib/auth";
import { KpiCard } from "@/components/ui/Card";
import FadeEnd from "@/components/ui/FadeEnd";
import { useBreakpoints } from "../hooks/useBreakpoints";
import {
	X,
	MapPin,
	Phone,
	Mail,
	Star,
	Wrench,
	CheckCircle2,
	XCircle,
	AlertCircle,
	ChevronRight
} from "lucide-react";
import { useEmployees, employeesQueryKey } from "@/lib/hooks/useEmployees";
import { useQueryClient } from "@tanstack/react-query";

const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";

// ─── Types ───────────────────────────────────────────────────────────────────

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
	latitude: number | null;
	longitude: number | null;
	internalNotes: string | null;
	createdAt: string;
};

const ALL_SKILLS: EmployeeSkill[] = [
	"hvac_install",
	"hvac_repair",
	"hvac_maintenance",
	"electrical",
	"refrigeration",
	"ductwork",
	"plumbing"
];

const SKILL_LABELS: Record<EmployeeSkill, string> = {
	hvac_install: "HVAC Install",
	hvac_repair: "HVAC Repair",
	hvac_maintenance: "HVAC Maint.",
	electrical: "Electrical",
	refrigeration: "Refrigeration",
	ductwork: "Ductwork",
	plumbing: "Plumbing"
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function initials(name: string) {
	return name
		.split(" ")
		.map((w) => w[0] ?? "")
		.slice(0, 2)
		.join("")
		.toUpperCase();
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function AvailabilityBadge({ available }: { available: boolean }) {
	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border",
				available
					? "bg-success/10 text-success-text border-success/25"
					: "bg-background-secondary text-text-tertiary border-background-secondary"
			)}
		>
			<span
				className={cn(
					"w-1.5 h-1.5 rounded-full",
					available ? "bg-success-text animate-pulse" : "bg-text-tertiary"
				)}
			/>
			{available ? "Available" : "Unavailable"}
		</span>
	);
}

function SkillBadge({ skill }: { skill: EmployeeSkill }) {
	return (
		<span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-accent-main/10 text-accent-text border border-accent-main/20">
			{SKILL_LABELS[skill]}
		</span>
	);
}

function StarRating({ rating }: { rating: number }) {
	return (
		<div className="flex items-center gap-1">
			<Star className="w-3.5 h-3.5 fill-warning-text text-warning-text" />
			<span className="text-sm font-medium text-text-main">
				{rating.toFixed(1)}
			</span>
		</div>
	);
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

type AddEmployeeForm = {
	name: string;
	email: string;
	phone: string;
	homeAddress: string;
	skills: EmployeeSkill[];
	skillLevel: Partial<Record<EmployeeSkill, number>>;
	maxConcurrentJobs: number;
	internalNotes: string;
	latitude: string;
	longitude: string;
};

function AddEmployeeModal({
	onClose,
	onCreated
}: {
	onClose: () => void;
	onCreated: () => void;
}) {
	const [form, setForm] = useState<AddEmployeeForm>({
		name: "",
		email: "",
		phone: "",
		homeAddress: "",
		skills: [],
		skillLevel: {},
		maxConcurrentJobs: 1,
		internalNotes: "",
		latitude: "",
		longitude: ""
	});
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);

	// We need a userId to create an employee — we'll create a user account first
	// or the admin can supply an existing userId. For simplicity we auto-register.
	const [userId, setUserId] = useState("");

	const toggleSkill = (skill: EmployeeSkill) => {
		setForm((f) => {
			const has = f.skills.includes(skill);
			const skills = has
				? f.skills.filter((s) => s !== skill)
				: [...f.skills, skill];
			const skillLevel = { ...f.skillLevel };
			if (has) delete skillLevel[skill];
			else skillLevel[skill] = 2;
			return { ...f, skills, skillLevel };
		});
	};

	const handleSubmit = async () => {
		if (!form.name.trim()) return setError("Name is required");
		if (!form.homeAddress.trim()) return setError("Home address is required");
		if (form.skills.length === 0) return setError("Select at least one skill");

		setLoading(true);
		setError(null);

		try {
			const token = getToken();
			const headers: HeadersInit = {
				"Content-Type": "application/json",
				...(token ? { Authorization: `Bearer ${token}` } : {})
			};

			// Step 1: create a user account for this employee (if no userId provided)
			let effectiveUserId = userId.trim();
			if (!effectiveUserId) {
				// Auto-generate an email from the name if not provided
				const emailForUser =
					form.email.trim() ||
					`${form.name.toLowerCase().replace(/\s+/g, ".")}.${Date.now()}@employee.local`;

				const userRes = await fetch(`${FASTIFY_BASE_URL}/register`, {
					method: "POST",
					headers,
					body: JSON.stringify({
						email: emailForUser,
						password: `Emp${Date.now()}!`
					})
				});

				if (!userRes.ok) {
					const d = (await userRes.json()) as { error?: string };
					// If register fails (e.g. email taken), try to get userId from DB via a different approach
					// For now just surface the error
					throw new Error(
						d.error ?? `Failed to create user (${userRes.status})`
					);
				}

				const userData = (await userRes.json()) as {
					user?: { userId?: string };
					userId?: string;
				};
				effectiveUserId =
					userData.user?.userId ?? (userData as any).userId ?? "";

				if (!effectiveUserId)
					throw new Error("No userId returned from register");
			}

			// Step 2: create the employee profile
			const body: Record<string, unknown> = {
				userId: effectiveUserId,
				name: form.name.trim(),
				skills: form.skills,
				skillLevel: form.skillLevel,
				homeAddress: form.homeAddress.trim(),
				maxConcurrentJobs: form.maxConcurrentJobs
			};
			if (form.email.trim()) body.email = form.email.trim();
			if (form.phone.trim()) body.phone = form.phone.trim();
			if (form.internalNotes.trim())
				body.internalNotes = form.internalNotes.trim();

			const empRes = await fetch(`${FASTIFY_BASE_URL}/employees`, {
				method: "POST",
				headers,
				body: JSON.stringify(body)
			});

			if (!empRes.ok) {
				const d = (await empRes.json()) as { error?: string };
				throw new Error(
					d.error ?? `Failed to create employee (${empRes.status})`
				);
			}

			const empData = (await empRes.json()) as { employee: Employee };

			// Step 3: if lat/lng provided, patch them in
			if (form.latitude.trim() && form.longitude.trim()) {
				const lat = parseFloat(form.latitude);
				const lng = parseFloat(form.longitude);
				if (!isNaN(lat) && !isNaN(lng)) {
					await fetch(`${FASTIFY_BASE_URL}/employees/${empData.employee.id}`, {
						method: "PATCH",
						headers,
						body: JSON.stringify({ latitude: lat, longitude: lng })
					});
				}
			}

			onCreated();
		} catch (e) {
			setError(e instanceof Error ? e.message : "Something went wrong");
		} finally {
			setLoading(false);
		}
	};

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
			<div className="bg-background-primary rounded-2xl border border-background-secondary w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl">
				{/* Header */}
				<div className="flex items-center justify-between p-5 border-b border-background-secondary">
					<h2 className="text-base font-semibold text-text-main">
						Add Employee
					</h2>
					<button
						onClick={onClose}
						className="p-1.5 rounded-lg hover:bg-background-secondary transition-colors"
					>
						<X className="w-4 h-4 text-text-secondary" />
					</button>
				</div>

				<div className="p-5 flex flex-col gap-4">
					{/* Basic Info */}
					<div className="grid grid-cols-1 gap-3">
						<Field label="Full Name *">
							<input
								className={inputCls}
								placeholder="Jane Smith"
								value={form.name}
								onChange={(e) =>
									setForm((f) => ({ ...f, name: e.target.value }))
								}
							/>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Email">
								<input
									className={inputCls}
									placeholder="jane@example.com"
									value={form.email}
									onChange={(e) =>
										setForm((f) => ({ ...f, email: e.target.value }))
									}
								/>
							</Field>
							<Field label="Phone">
								<input
									className={inputCls}
									placeholder="214-555-0001"
									value={form.phone}
									onChange={(e) =>
										setForm((f) => ({ ...f, phone: e.target.value }))
									}
								/>
							</Field>
						</div>
						<Field label="Home Address *">
							<input
								className={inputCls}
								placeholder="123 Main St, Dallas, TX 75201"
								value={form.homeAddress}
								onChange={(e) =>
									setForm((f) => ({ ...f, homeAddress: e.target.value }))
								}
							/>
						</Field>
						<div className="grid grid-cols-2 gap-3">
							<Field label="Latitude (for dispatch)">
								<input
									className={inputCls}
									placeholder="32.7767"
									value={form.latitude}
									onChange={(e) =>
										setForm((f) => ({ ...f, latitude: e.target.value }))
									}
								/>
							</Field>
							<Field label="Longitude">
								<input
									className={inputCls}
									placeholder="-96.7970"
									value={form.longitude}
									onChange={(e) =>
										setForm((f) => ({ ...f, longitude: e.target.value }))
									}
								/>
							</Field>
						</div>
					</div>

					{/* Skills */}
					<div>
						<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
							Skills *
						</p>
						<div className="flex flex-wrap gap-2">
							{ALL_SKILLS.map((skill) => {
								const active = form.skills.includes(skill);
								return (
									<button
										key={skill}
										onClick={() => toggleSkill(skill)}
										className={cn(
											"px-3 py-1 rounded-full text-xs font-medium border transition-colors",
											active
												? "bg-accent-main/15 text-accent-text border-accent-main/40"
												: "bg-background-secondary text-text-secondary border-background-secondary hover:border-accent-main/30"
										)}
									>
										{SKILL_LABELS[skill]}
									</button>
								);
							})}
						</div>
					</div>

					{/* Skill levels for selected skills */}
					{form.skills.length > 0 && (
						<div>
							<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
								Skill Levels
							</p>
							<div className="flex flex-col gap-2">
								{form.skills.map((skill) => (
									<div
										key={skill}
										className="flex items-center justify-between"
									>
										<span className="text-sm text-text-main">
											{SKILL_LABELS[skill]}
										</span>
										<div className="flex gap-1">
											{[1, 2, 3].map((level) => (
												<button
													key={level}
													onClick={() =>
														setForm((f) => ({
															...f,
															skillLevel: { ...f.skillLevel, [skill]: level }
														}))
													}
													className={cn(
														"w-8 h-7 rounded text-xs font-semibold border transition-colors",
														form.skillLevel[skill] === level
															? "bg-accent-main text-white border-accent-main"
															: "bg-background-secondary text-text-secondary border-background-secondary hover:border-accent-main/30"
													)}
												>
													{level}
												</button>
											))}
										</div>
									</div>
								))}
							</div>
						</div>
					)}

					{/* Max concurrent jobs */}
					<Field label="Max Concurrent Jobs">
						<input
							className={inputCls}
							type="number"
							min={1}
							max={20}
							value={form.maxConcurrentJobs}
							onChange={(e) =>
								setForm((f) => ({
									...f,
									maxConcurrentJobs: parseInt(e.target.value) || 1
								}))
							}
						/>
					</Field>

					{/* Existing userId override */}
					<Field label="Existing User ID (optional — leave blank to auto-create)">
						<input
							className={inputCls}
							placeholder="uuid of existing user account"
							value={userId}
							onChange={(e) => setUserId(e.target.value)}
						/>
					</Field>

					<Field label="Internal Notes">
						<textarea
							className={cn(inputCls, "resize-none h-20")}
							placeholder="Admin-only notes..."
							value={form.internalNotes}
							onChange={(e) =>
								setForm((f) => ({ ...f, internalNotes: e.target.value }))
							}
						/>
					</Field>

					{error && (
						<div className="flex items-center gap-2 p-3 bg-error/10 border border-error/25 rounded-lg text-sm text-error-text">
							<AlertCircle className="w-4 h-4 shrink-0" />
							{error}
						</div>
					)}

					<div className="flex gap-2 pt-1">
						<button
							onClick={onClose}
							className="flex-1 py-2 rounded-lg border border-background-secondary text-sm text-text-secondary hover:bg-background-secondary transition-colors"
						>
							Cancel
						</button>
						<button
							onClick={handleSubmit}
							disabled={loading}
							className="flex-1 py-2 rounded-lg bg-accent-main text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
						>
							{loading ? "Creating..." : "Add Employee"}
						</button>
					</div>
				</div>
			</div>
		</div>
	);
}

const inputCls =
	"w-full bg-background-secondary border border-background-secondary/80 rounded-lg px-3 py-2 text-sm text-text-main placeholder:text-text-tertiary focus:outline-none focus:border-accent-main/50 transition-colors";

function Field({
	label,
	children
}: {
	label: string;
	children: React.ReactNode;
}) {
	return (
		<div className="flex flex-col gap-1">
			<label className="text-xs font-medium text-text-tertiary">{label}</label>
			{children}
		</div>
	);
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function EmployeesPage() {
	const { data: employees = [], isLoading: loading, error } = useEmployees();
	const queryClient = useQueryClient();
	const [showAddModal, setShowAddModal] = useState(false);
	const [selectedEmployee, setSelectedEmployee] = useState<Employee | null>(
		null
	);
	const { lgUp } = useBreakpoints();

	const active = employees.filter((e) => e.isActive).length;
	const available = employees.filter((e) => e.isAvailable).length;
	const onJob = employees.filter((e) => e.currentJobId).length;
	const avgRating =
		employees.length > 0
			? (
					employees.reduce((s, e) => s + e.rating, 0) / employees.length
				).toFixed(1)
			: "—";

	return (
		<>
			<MainContent className={cn("flex flex-col gap-4")}>
				{/* KPI Strip */}
				<FadeEnd
					className={cn("h-32 w-full overflow-hidden")}
					orientation="horizontal"
					prefix="both"
					fromColorClass="from-background-main"
					sizeClass="w-8"
					wrapperClassName="flex px-2 flex-row h-full w-full overflow-x-auto no-scrollbar gap-3 bg-transparent"
				>
					<KpiCard
						title="Total Employees"
						value={String(employees.length)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Active"
						value={String(active)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Available Now"
						value={String(available)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="On a Job"
						value={String(onJob)}
						className={cn("w-xs shrink-0")}
					/>
					<KpiCard
						title="Avg Rating"
						value={String(avgRating)}
						className={cn("w-xs shrink-0")}
					/>
				</FadeEnd>

				{/* Employee List */}
				<div
					className={cn(
						"mx-2 w-full bg-background-primary rounded-xl border border-background-secondary relative pt-12"
					)}
				>
					{/* Column Headers */}
					<div className="border-b border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-[2fr_1fr_2fr_1fr_1fr_1.5rem]">
						{["Name", "Status", "Skills", "Rating", "Jobs"].map((col) => (
							<p key={col} className="text-sm font-medium text-foreground/60">
								{col}
							</p>
						))}
						<div />
					</div>

					<ul className="w-full divide-y divide-background-secondary/50 px-4 py-3">
						{loading && (
							<li className="text-xs text-text-tertiary py-3 px-4">
								Loading employees...
							</li>
						)}
						{!loading && employees.length === 0 && (
							<li className="text-xs text-text-tertiary py-3 px-4">
								No employees yet. Add one using the + button below.
							</li>
						)}
						{employees.map((emp) => (
							<li
								key={emp.id}
								className="grid grid-cols-[2fr_1fr_2fr_1fr_1fr_1.5rem] items-center px-4 py-3 cursor-pointer hover:bg-background-secondary/30 rounded-lg transition-colors"
								onClick={() => setSelectedEmployee(emp as Employee)}
							>
								{/* Name + address */}
								<div className="flex items-center gap-3 min-w-0">
									<div className="w-8 h-8 rounded-full bg-accent-main/20 text-accent-text flex items-center justify-center text-xs font-bold shrink-0">
										{initials(emp.name)}
									</div>
									<div className="min-w-0">
										<p className="text-sm font-medium text-text-main truncate">
											{emp.name}
										</p>
										{emp.phone && (
											<p className="text-xs text-text-tertiary truncate">
												{emp.phone}
											</p>
										)}
									</div>
								</div>

								{/* Status */}
								<div>
									<AvailabilityBadge available={emp.isAvailable} />
								</div>

								{/* Skills */}
								<div className="flex flex-wrap gap-1 min-w-0">
									{emp.skills.slice(0, 3).map((s) => (
										<SkillBadge key={s} skill={s as EmployeeSkill} />
									))}
									{emp.skills.length > 3 && (
										<span className="text-xs text-text-tertiary">
											+{emp.skills.length - 3}
										</span>
									)}
								</div>

								{/* Rating */}
								<StarRating rating={emp.rating} />

								{/* Jobs */}
								<div className="flex items-center gap-1">
									{emp.currentJobId ? (
										<span className="text-xs text-info-text font-medium">
											On job
										</span>
									) : (
										<span className="text-xs text-text-tertiary">—</span>
									)}
								</div>

								{/* Arrow */}
								<ChevronRight className="w-4 h-4 text-text-tertiary" />
							</li>
						))}
					</ul>
				</div>

				{error && (
					<p className={cn("mx-2 text-sm text-red-600")}>{error.message}</p>
				)}

				{/* Employee Detail Slide-in */}
				{selectedEmployee && (
					<EmployeeDetailPanel
						employee={selectedEmployee}
						onClose={() => setSelectedEmployee(null)}
						onUpdated={(updated) => {
							// Invalidate the employees list cache so the list refetches,
							// and update the open detail panel with the fresh employee data.
							void queryClient.invalidateQueries({
								queryKey: employeesQueryKey
							});
							setSelectedEmployee(updated);
						}}
					/>
				)}
			</MainContent>

			{showAddModal && (
				<AddEmployeeModal
					onClose={() => setShowAddModal(false)}
					onCreated={() => {
						// Invalidate cache so the new employee appears in the list.
						void queryClient.invalidateQueries({ queryKey: employeesQueryKey });
						setShowAddModal(false);
					}}
				/>
			)}
		</>
	);
}

// ─── Employee Detail Panel ────────────────────────────────────────────────────

function EmployeeDetailPanel({
	employee,
	onClose,
	onUpdated
}: {
	employee: Employee;
	onClose: () => void;
	onUpdated: (emp: Employee) => void;
}) {
	const [toggling, setToggling] = useState(false);

	const toggleAvailability = async () => {
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
			if (!res.ok) throw new Error("Failed to update");
			const data = (await res.json()) as { employee: Employee };
			onUpdated(data.employee);
		} catch {
			// silently ignore for now
		} finally {
			setToggling(false);
		}
	};

	return (
		<div className="fixed inset-0 z-40 flex justify-end">
			{/* Backdrop */}
			<div
				className="absolute inset-0 bg-black/30 backdrop-blur-sm"
				onClick={onClose}
			/>
			{/* Panel */}
			<div className="relative z-50 w-full max-w-sm bg-background-primary border-l border-background-secondary h-full overflow-y-auto shadow-2xl flex flex-col">
				{/* Header */}
				<div className="flex items-center justify-between p-5 border-b border-background-secondary">
					<h2 className="text-base font-semibold text-text-main">
						Employee Details
					</h2>
					<button
						onClick={onClose}
						className="p-1.5 rounded-lg hover:bg-background-secondary transition-colors"
					>
						<X className="w-4 h-4 text-text-secondary" />
					</button>
				</div>

				<div className="p-5 flex flex-col gap-5">
					{/* Avatar + name */}
					<div className="flex items-center gap-4">
						<div className="w-14 h-14 rounded-xl bg-accent-main/20 text-accent-text flex items-center justify-center text-lg font-bold shrink-0">
							{initials(employee.name)}
						</div>
						<div className="flex flex-col gap-1">
							<h3 className="text-lg font-semibold text-text-main">
								{employee.name}
							</h3>
							<div className="flex items-center gap-2 flex-wrap">
								<AvailabilityBadge available={employee.isAvailable} />
								{employee.isActive ? (
									<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-success/10 text-success-text border border-success/25">
										<CheckCircle2 className="w-3 h-3" /> Active
									</span>
								) : (
									<span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-background-secondary text-text-tertiary border border-background-secondary">
										<XCircle className="w-3 h-3" /> Inactive
									</span>
								)}
							</div>
						</div>
					</div>

					{/* Rating */}
					<div className="bg-background-secondary/50 rounded-xl p-4 flex items-center justify-between">
						<div>
							<p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">
								Rating
							</p>
							<StarRating rating={employee.rating} />
						</div>
						<div>
							<p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">
								Max Jobs
							</p>
							<p className="text-sm font-semibold text-text-main">
								{employee.maxConcurrentJobs}
							</p>
						</div>
						<div>
							<p className="text-xs text-text-tertiary uppercase tracking-wide mb-1">
								Current
							</p>
							<p className="text-sm font-semibold text-text-main">
								{employee.currentJobId ? "1 job" : "Free"}
							</p>
						</div>
					</div>

					{/* Contact */}
					<div className="flex flex-col gap-2">
						<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide">
							Contact
						</p>
						{employee.email && (
							<div className="flex items-center gap-2 text-sm text-text-secondary">
								<Mail className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
								{employee.email}
							</div>
						)}
						{employee.phone && (
							<div className="flex items-center gap-2 text-sm text-text-secondary">
								<Phone className="w-3.5 h-3.5 shrink-0 text-text-tertiary" />
								{employee.phone}
							</div>
						)}
						<div className="flex items-start gap-2 text-sm text-text-secondary">
							<MapPin className="w-3.5 h-3.5 shrink-0 text-text-tertiary mt-0.5" />
							<span>{employee.homeAddress}</span>
						</div>
						{employee.latitude != null && employee.longitude != null && (
							<div className="flex items-center gap-2 text-xs text-text-tertiary font-mono">
								<MapPin className="w-3 h-3 shrink-0" />
								{employee.latitude.toFixed(4)}, {employee.longitude.toFixed(4)}
							</div>
						)}
					</div>

					{/* Skills */}
					<div>
						<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-2">
							Skills
						</p>
						<div className="flex flex-wrap gap-2">
							{employee.skills.map((skill) => (
								<div key={skill} className="flex items-center gap-1.5">
									<SkillBadge skill={skill} />
									{employee.skillLevel[skill] && (
										<span className="text-xs text-text-tertiary font-medium">
											Lv.{employee.skillLevel[skill]}
										</span>
									)}
								</div>
							))}
						</div>
					</div>

					{/* Internal notes */}
					{employee.internalNotes && (
						<div>
							<p className="text-xs font-medium text-text-tertiary uppercase tracking-wide mb-1">
								Internal Notes
							</p>
							<p className="text-sm text-text-secondary leading-relaxed bg-background-secondary/50 rounded-lg p-3">
								{employee.internalNotes}
							</p>
						</div>
					)}

					{/* Toggle availability */}
					<button
						onClick={toggleAvailability}
						disabled={toggling}
						className={cn(
							"w-full py-2.5 rounded-xl text-sm font-medium border transition-colors disabled:opacity-50",
							employee.isAvailable
								? "bg-background-secondary text-text-secondary border-background-secondary hover:bg-error/10 hover:text-error-text hover:border-error/25"
								: "bg-success/10 text-success-text border-success/25 hover:bg-success/20"
						)}
					>
						{toggling
							? "Updating..."
							: employee.isAvailable
								? "Mark Unavailable"
								: "Mark Available"}
					</button>
				</div>
			</div>
		</div>
	);
}
