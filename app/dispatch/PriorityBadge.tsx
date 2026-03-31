import type { JobPriority } from "@/app/types/types";
import { cn } from "@/lib/utils";
import { TriangleAlert } from "lucide-react";

export default function PriorityBadge({ priority }: { priority: JobPriority }) {
	const classes: Record<JobPriority, string> = {
		emergency:
			"bg-destructive-background/15 text-destructive-text border border-destructive-foreground/30",
		high: "bg-warning-background/25 text-warning-text border border-warning-foreground/30",
		medium: "bg-accent-main/10 text-accent-text border border-accent-main/30",
		low: "bg-background-secondary/50 text-text-secondary border border-background-secondary"
	};

	return (
		<span
			className={cn(
				"inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium capitalize",
				classes[priority]
			)}
		>
			{priority === "emergency" && <TriangleAlert className="w-3 h-3" />}
			{priority}
		</span>
	);
}
