"use client";

import Sidebar from "@/components/layout/Sidebar";
import { SidebarItemParams } from "@/app/types/types"
import { Calendar, Headset, History, Home as HomeIcon, Settings, User, Wrench, BarChart3 } from "lucide-react";

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
  return (
    <>
      <main className="bg-background-main text-text-main w-full min-h-screen px-6 py-8">
        jj
      </main>
        <Sidebar title="Tech to Customer" autoCollapse={false} items={sidebarItems} />
    </>
  );
}
