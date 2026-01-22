"use client";

import clsx from "clsx";
import { useState } from "react";
import Sidebar from "@/components/layout/Sidebar";
import { SidebarItemParams } from "@/app/types/types"
import { Calendar, Headset, History, Home as HomeIcon, Settings, Wrench, BarChart3, ArrowUpRight, ChevronRight, TrendingUp } from "lucide-react";
import { Card, KpiCard, DataCard, ListCard, TableCard } from "@/components/ui/Card";
import { useBreakpoints } from "@/lib/hooks/useBreakpoints";
import { BarChart, LineGraph } from "@/components/ui/Chart";

const sidebarItems: SidebarItemParams[] = [
  { id: 1, title: "Home", icon: HomeIcon },
  { id: 2, title: "Settings", icon: Settings },
  { id: 3, title: "Statistics", icon: BarChart3 },
  { id: 4, title: "Work History", icon: History },
  { id: 5, title: "Calendar", icon: Calendar },
  { id: 6, title: "Tools", icon: Wrench },
  { id : 7, title: "Dispatch", icon: Headset },

];

const openJobsColumns = [
    { key: "id", header: "ID" },
    { key: "customer", header: "Customer" },
    { key: "status", header: "Status" },
] as const;

const openJobsRows = [
    { id: "1042", customer: "Acme", status: "Open" },
    { id: "1043", customer: "Globex", status: "In progress" },
];

export default function Home() {
    const [sidebarAutoCollapse, setSidebarAutoCollapse] = useState(false);
    const [sidebarIsStrip, setSidebarIsStrip] = useState(false);
    const { lgUp } = useBreakpoints();


  return (
    <>
        <main
            className={clsx(
                "bg-background-main text-text-main w-full min-h-screen py-8 transition-[padding] duration-300 absolute mb-6 px-6",
                lgUp
                ? sidebarAutoCollapse
                ? "pl-6"
                : "pl-[calc(var(--sidebar-desktop-width)-var(--sidebar-main-gap))]"
                : sidebarIsStrip
                ? "pl-20"
                
                : "pl-6"
            )}
        >
            <BarChart
                yAxisLabel="Jobs"
                Groups={['Mon', 'Tue', 'Wed', 'Thu', 'Fri']}
                GroupsData={[5, 10, 7, 12, 8]}
            />
            <LineGraph
                points={[
                    { x: 0, y: 0 },
                    { x: 1, y: 2 },
                    { x: 2, y: 4 },
                    { x: 3, y: 6 },
                    { x: 4, y: 100 },
                ]}
                lineType="connect"
                width={300}
                height={150}
            />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 3xl:grid-cols-5 mx-auto">
            <Card
                type="kpi"
                title="Total Jobs Today"
                value="27"
                trend={{ value: "+12%", tone: "success" }}
                meta="vs yesterday"
                icon={<TrendingUp className="h-5 w-5 text-text-secondary" />}
                actions={
                    <button className="text-xs text-text-secondary hover:text-text-main transition-colors">
                        View
                    </button>
                }
                footer="Updated 2 minutes ago"
            />

            <KpiCard
                title="Avg. Response Time"
                subtitle="Last 7 days"
                value="14m"
                trend={{ value: "-3m", tone: "info" }}
                meta="median"
                icon={<ArrowUpRight className="h-5 w-5 text-text-secondary" />}
            />

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
                <div className="h-32 grid place-items-center text-xs text-text-secondary">
                    Chart/Table goes here
                </div>
            </Card>

            <TableCard
                title="Open Jobs Table"
                subtitle="Top 5 by priority"
                toolbar={<div className="text-xs text-text-secondary">Filter: All</div>}
                columns={[...openJobsColumns]}
                rows={[...openJobsRows]}
                getRowKey={row => row.id}
            />

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
                        id: "jobs",
                        label: "Jobs",
                        description: "Support requests and triage",
                        href: "/jobs",
                        right: <ChevronRight className="h-4 w-4" />,
                    },
                ]}
            />

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
