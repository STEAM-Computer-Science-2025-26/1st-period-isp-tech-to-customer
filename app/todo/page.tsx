"use client";

import React, { useState } from "react";
import MainContent from "@/components/layout/MainContent";
import { cn } from "@/lib/utils/index";

const TodoPage = () => {
	const [tasks, setTasks] = useState<{ id: string; label: string }[]>([]);

	return (
		<>
			<MainContent className={cn(`flex flex-col gap-4`)}>
				<div className={cn(`bg-red-300/20 w-full h-20`)}></div>
				<div
					className={cn(
						`bg-red-300/20 w-full h-full grid grid-cols-2 gap-4 px-2`
					)}
				>
					<ul
						className={cn(
							`bg-green-300/30 h-30 grid grid-cols-[2rem_1fr] gap-4`
						)}
					>
						{tasks.map((task) => (
							<li
								key={task.id}
								className={cn(`grid col-span-2 grid-cols-subgrid`)}
							>
								<div> {/* circle */}</div>
								<div> {/* actual task */}</div>
							</li>
						))}
					</ul>
				</div>
			</MainContent>
		</>
	);
};

export default TodoPage;
