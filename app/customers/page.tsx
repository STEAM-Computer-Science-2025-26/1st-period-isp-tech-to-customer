"use client";

import Header from "@/components/layout/Header";
import MainContent from "@/components/layout/MainContent";
import Sidebar from "@/components/layout/sidebar/Sidebar";
import { defaultSidebarItems } from "@/components/layout/sidebar/SidebarItems";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils/index";
import { KpiCard } from "@/components/ui/Card";
import FadeEnd from "@/components/ui/FadeEnd";
import Fab from "@/components/ui/Fab";
import { useBreakpoints } from "../hooks/useBreakpoints";
import { useRouter } from "next/navigation";

const FASTIFY_BASE_URL =
	process.env.NEXT_PUBLIC_FASTIFY_URL ?? "http://localhost:3001";

type Customer = {
	id: string;
	firstName: string;
	lastName: string;
	companyName?: string;
	customerType: string;
	email: string;
	phone: string;
	address: string;
	city: string;
	state: string;
	zip: string;
	isActive: boolean;
	noShowCount: number;
	createdAt: string;
};

function getToken() {
	return (
		localStorage.getItem("authToken") ??
		localStorage.getItem("token") ??
		localStorage.getItem("jwt")
	);
}

export default function CustomersPage() {
	const [customers, setCustomers] = useState<Customer[]>([]);
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
	const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
	const { lgUp } = useBreakpoints();
	const router = useRouter();

	useEffect(() => {
		let mounted = true;
		setLoading(true);
		setError(null);

		void (async () => {
			try {
				const token = getToken();
				const res = await fetch(`${FASTIFY_BASE_URL}/customers`, {
					headers: token ? { Authorization: `Bearer ${token}` } : {}
				});
				if (!res.ok)
					throw new Error(`Failed to load customers (${res.status})`);
				const data = (await res.json()) as { customers?: Customer[] };
				if (mounted) setCustomers(data.customers ?? []);
			} catch (e) {
				if (mounted)
					setError(e instanceof Error ? e.message : "Failed to load customers");
			} finally {
				if (mounted) setLoading(false);
			}
		})();

		return () => {
			mounted = false;
		};
	}, []);

	const active = customers.filter((c) => c.isActive).length;
	const residential = customers.filter(
		(c) => c.customerType === "residential"
	).length;
	const commercial = customers.filter(
		(c) => c.customerType === "commercial"
	).length;
	const withNoShows = customers.filter((c) => c.noShowCount > 0).length;

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

				{/* Customer List */}
				<div
					className={cn(
						"mx-2 w-full bg-background-primary rounded-xl border border-background-secondary relative pt-12"
					)}
				>
					{/* Header */}
					<div className="border-b border-secondary/50 h-12 absolute top-0 inset-x-4 items-center grid grid-cols-5">
						{["Name", "Type", "Phone", "Address", "Status"].map((col) => (
							<p key={col} className="text-sm font-medium text-foreground/60">
								{col}
							</p>
						))}
					</div>
					<ul className="w-full divide-y divide-background-secondary/50 px-4 py-3">
						{loading && (
							<li className="text-xs text-text-tertiary py-3 px-4">
								Loading customers...
							</li>
						)}
						{!loading && customers.length === 0 && (
							<li className="text-xs text-text-tertiary py-3 px-4">
								No customers found. Add one using the button below!
							</li>
						)}
						{customers.map((c) => (
							<li
								key={c.id}
								className="grid grid-cols-5 px-4 py-3 cursor-pointer hover:bg-background-secondary/30 rounded-lg transition-colors"
								onClick={() => router.push(`/customers/${c.id}`)}
							>
								<p className="text-sm font-medium">
									{c.firstName} {c.lastName}
								</p>
								<p className="text-sm capitalize">{c.customerType}</p>
								<p className="text-sm text-text-secondary">{c.phone}</p>
								<p className="text-sm text-text-secondary">
									{c.city}, {c.state}
								</p>
								<p
									className={cn(
										"text-sm",
										c.isActive ? "text-success-text" : "text-text-tertiary"
									)}
								>
									{c.isActive ? "Active" : "Inactive"}
								</p>
							</li>
						))}
					</ul>
				</div>

				{error && <p className={cn("mx-2 text-sm text-red-600")}>{error}</p>}

				<Fab
					size={lgUp ? "md" : "sm"}
					icon="plus"
					className={cn("bottom-4 right-4")}
					title="Add New Customer"
					onClick={() => console.log("Add customer")}
				/>
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
