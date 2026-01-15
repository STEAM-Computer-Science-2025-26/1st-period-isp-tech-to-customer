"use client";

import Sidebar from "@/components/layout/Sidebar";
import { SidebarItemParams } from "@/app/types/types"

const sidebarItems: SidebarItemParams[] = [
  { id: 1, title: "home", icon: "", onClick: (
    () => {
      alert("goon");
    })
  } 
];

export default function Home() {
  return (
    <>
      <main className="bg-background-main text-text-main w-full min-h-screen px-6 py-8">
        jj
      </main>
      <Sidebar autoCollapse={false} items={sidebarItems} />
    </>
  );
}
