"use client";


import { SidebarParams, SidebarItemParams } from "@/app/types/types"
import clsx from "clsx";

export default function Sidebar({ autoCollapse = true, items = [] }: SidebarParams = {}) {
	return (
		<aside className={clsx("w-1/4 max-w-76 absolute inset-y-0 left-0 px-4 pr-8 py-4 pointer-events-none", autoCollapse ? "pointer-events-auto -translate-x-[calc(100%-1rem)] hover:translate-x-0 transition-transform duration-300" : "")}>
			<div className="w-full h-full bg-background-secondary/50 rounded-xl backdrop-blur-md pointer-events-auto flex flex-col gap-2 px-1.5 py-2">
				<ul className="grid grid-cols-[2rem_1fr] gap-2 w-full">
					{ items.map((item) => (
						<SidebarItem id={item.id} key={item.id} title={item.title} icon={item.icon} onClick={item.onClick} />
					)) }
				</ul>
			</div>
		</aside>
	);
}


function SidebarItem({ title, onClick }: SidebarItemParams) {
	return (
		<li
			onClick={onClick}
				/*
					The onClick handler will be invoked immediately during render. The previous version had () => 
					onClick which was also incorrect, but the fix should be onClick={onClick} only if onClick is
					already a function, or onClick={() => onClick()} if onClick needs to be invoked.
				*/
				// TODO: Fix the onClick handler invocation
			className="grid col-span-2 grid-cols-subgrid w-full hover:bg-background-secondary/50 transition-colors duration-200 h-8 items-center rounded-md px-2"
		>
			<div className="bg-red-300/50 aspect-square">
			</div>
			<p className="">
				{title}
			</p>
		</li>
	);
}