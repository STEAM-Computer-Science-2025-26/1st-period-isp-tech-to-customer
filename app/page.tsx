"use client";

import clsx from "clsx";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { SidebarItemParams } from "@/app/types/types"
import { Calendar, Headset, History, Home as HomeIcon, Settings, Wrench, BarChart3, ArrowUpRight, ChevronRight } from "lucide-react";
import { Card, KpiCard, DataCard, ListCard } from "@/components/ui/Card";
import { useBreakpoints } from "@/lib/hooks/useBreakpoints";

const sidebarItems: SidebarItemParams[] = [
  { id: 1, title: "Home", icon: HomeIcon },
  { id: 2, title: "Settings", icon: Settings },
  { id: 3, title: "Statistics", icon: BarChart3 },
  { id: 4, title: "Work History", icon: History },
  { id: 5, title: "Calendar", icon: Calendar },
  { id: 6, title: "Tools", icon: Wrench },
  { id : 7, title: "Dispatch", icon: Headset },

];

export default function Home() {
    const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
    const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
    const { mdUp } = useBreakpoints();


  return (
    <>
        <main
            className={clsx(
                "bg-background-main text-text-main w-full min-h-screen py-8 transition-[padding] duration-300 absolute mb-6 px-6",
                mdUp
                    ? sidebarAutoCollapse
                        ? "pl-6"
                        : "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
                    : sidebarIsStrip
                        ? "pl-20"
                        : "pl-6"
            )}
        >
        <div className="grid gap-4 md:grid-cols-2">
            <Card
                type="kpi"
                title="Tickets Today"
                subtitle="Support queue"
                value="27"
                trend={{ value: "+12%", tone: "success" }}
                meta="vs yesterday"
                icon={<BarChart3 className="h-5 w-5 text-text-secondary" />}
                actions={
                    <button className="text-xs text-text-secondary hover:text-text-main transition-colors">
                        View
                    </button>
                }
                footer="Updated 2 minutes ago"
            />

            {/* ========== KPI (using the KpiCard wrapper) ========== */}
            <KpiCard
                title="Avg. Response Time"
                subtitle="Last 7 days"
                value="14m"
                trend={{ value: "-3m", tone: "info" }}
                meta="median"
                icon={<ArrowUpRight className="h-5 w-5 text-text-secondary" />}
            />

            {/* ========== Data (using the generic Card) ========== */}
            <Card
                type="data"
                title="Weekly Volume"
                subtitle="Requests by day"
                toolbar={
                    <div className="flex items-center gap-2">
                        <button className="text-xs px-2 py-1 rounded-md bg-background-secondary/60 hover:bg-background-secondary transition-colors">
                            7d
                        </button>
                        <button className="text-xs px-2 py-1 rounded-md bg-background-secondary/60 hover:bg-background-secondary transition-colors">
                            30d
                        </button>
                    </div>
                }
            >
                {/* Replace with your chart/table component */}
                <div className="h-32 grid place-items-center text-xs text-text-secondary">
                    Chart/Table goes here
                </div>
            </Card>

            {/* ========== Data (using the DataCard wrapper) ========== */}
            <DataCard
                title="Open Tickets Table"
                subtitle="Top 5 by priority"
                toolbar={<div className="text-xs text-text-secondary">Filter: All</div>}
            >
                <table className="w-full text-sm">
                    <thead className="text-text-secondary">
                        <tr>
                            <th className="text-left py-1">ID</th>
                            <th className="text-left py-1">Customer</th>
                            <th className="text-left py-1">Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr className="border-t border-background-secondary/50">
                            <td className="py-2">#1042</td>
                            <td className="py-2">Acme</td>
                            <td className="py-2">Open</td>
                        </tr>
                        <tr className="border-t border-background-secondary/50">
                            <td className="py-2">#1043</td>
                            <td className="py-2">Globex</td>
                            <td className="py-2">In progress</td>
                        </tr>
                    </tbody>
                </table>
            </DataCard>

            {/* ========== List (using the generic Card with items; unordered) ========== */}
            <Card
                type="list"
                title="Quick Links"
                subtitle="Common pages"
                items={[
                    {
                        id: "customers",
                        label: "Customers",
                        description: "View and manage accounts",
                        href: "/customers",
                        right: <ChevronRight className="h-4 w-4" />,
                    },
                    {
                        id: "tickets",
                        label: "Tickets",
                        description: "Support requests and triage",
                        href: "/tickets",
                        right: <ChevronRight className="h-4 w-4" />,
                    },
                ]}
            />

            {/* ========== List (using the ListCard wrapper; ordered + onClick actions) ========== */}
            <ListCard
                title="Next Steps"
                subtitle="Do these in order"
                ordered
                items={[
                    {
                        label: "Verify customer info",
                        description: "Confirm address and plan",
                        onClick: () => console.log("verify"),
                        right: <span className="text-xs">1 min</span>,
                    },
                    {
                        label: "Run line test",
                        description: "Check signal + modem status",
                        onClick: () => console.log("line test"),
                        right: <span className="text-xs">3 min</span>,
                    },
                    {
                        label: "Schedule technician",
                        description: "If issue persists",
                        onClick: () => console.log("schedule"),
                        right: <span className="text-xs">5 min</span>,
                    },
                ]}
                footer="Tip: click an item to start the step"
            />
        </div>
      </main>
        <Sidebar
            title="Tech to Customer"
            autoCollapse={false}
            items={sidebarItems}
            onFlagsChange={({ autoCollapse, isStrip }) => {
                setSidebarAutoCollapse(autoCollapse);
                setSidebarIsStrip(isStrip);
            }}
        />
    </>
  );
}
