import { Check, Clock3 } from "lucide-react";
import { cn } from "@/lib/utils";

export type InvoiceTimelineStatus =
	| "draft"
	| "sent"
	| "partial"
	| "paid"
	| "overdue"
	| "void";

type TimelineStep = {
	key: string;
	label: string;
	state: "done" | "current" | "pending" | "alert";
};

function getSteps(status: InvoiceTimelineStatus): TimelineStep[] {
	switch (status) {
		case "draft":
			return [
				{ key: "created", label: "Created", state: "current" },
				{ key: "sent", label: "Sent", state: "pending" },
				{ key: "completed", label: "Completed", state: "pending" }
			];
		case "sent":
			return [
				{ key: "created", label: "Created", state: "done" },
				{ key: "sent", label: "Sent", state: "current" },
				{ key: "completed", label: "Completed", state: "pending" }
			];
		case "partial":
			return [
				{ key: "created", label: "Created", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "completed", label: "Partial", state: "current" }
			];
		case "paid":
			return [
				{ key: "created", label: "Created", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "completed", label: "Completed", state: "done" }
			];
		case "overdue":
			return [
				{ key: "created", label: "Created", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "completed", label: "Overdue", state: "alert" }
			];
		case "void":
			return [
				{ key: "created", label: "Created", state: "done" },
				{ key: "sent", label: "Sent", state: "done" },
				{ key: "completed", label: "Voided", state: "alert" }
			];
	}
}

function getProgressIndex(steps: TimelineStep[]): number {
	const doneLastIndex = steps.reduce(
		(lastIndex, step, index) => (step.state === "done" ? index : lastIndex),
		-1
	);
	const currentIndex = steps.findIndex(
		(step) => step.state === "current" || step.state === "alert"
	);

	if (currentIndex <= 0) return doneLastIndex;
	return Math.max(doneLastIndex, currentIndex - 1);
}

function CircleIcon({ state }: { state: TimelineStep["state"] }) {
	if (state === "done") return <Check className="w-3 h-3" />;
	if (state === "alert") return <span className="text-xs leading-none">!</span>;
	if (state === "current") return <Clock3 className="w-3 h-3" />;
	return;
}

function circleClass(state: TimelineStep["state"]): string {
	switch (state) {
		case "done":
			return "bg-success-background/30 text-success-text border-success-foreground ";
		case "current":
			return "bg-accent-main/30 text-accent-text-dark border-accent-text";
		case "alert":
			return "bg-destructive-background/30 text-destructive-text border-destructive-foreground";
		case "pending":
			return "bg-background-secondary/70 text-text-tertiary border-dashed border-text-tertiary";
	}
}

export function InvoiceTimeline({
	status,
	className
}: {
	status: InvoiceTimelineStatus;
	className?: string;
}) {
	const steps = getSteps(status);
	const progressIndex = getProgressIndex(steps);

	return (
		<div className={cn("px-2", className)}>
			<div className="flex items-center">
				{steps.map((step, index) => (
					<div
						key={step.key}
						className={cn(
							"flex items-center",
							index === steps.length - 1 ? "grow-0" : "flex-1"
						)}
					>
						<div
							className={cn(
								"w-7 h-7 rounded-full border grid place-items-center text-[11px]",
								circleClass(step.state)
							)}
						>
							<CircleIcon state={step.state} />
						</div>
						{index < steps.length - 1 ? (
							<div
								className={cn(
									"h-0.5 flex-1 mx-2 rounded",
									index <= progressIndex
										? "bg-accent-main/50"
										: "bg-background-secondary"
								)}
							/>
						) : null}
					</div>
				))}
			</div>
			<div className="mt-2 flex flex-row items-center text-[11px] font-medium">
				{steps.map((step, index) => (
					<span
						key={`label-${step.key}`}
						className={cn(
							"w-1/3",
							index === 0 && "text-left",
							index === steps.length - 1 && "text-right",
							index > 0 && index < steps.length - 1 && "text-center",
							step.state === "alert"
								? "text-destructive-text"
								: step.state === "pending"
									? "text-text-tertiary"
									: "text-text-main"
						)}
					>
						{step.label}
					</span>
				))}
			</div>
		</div>
	);
}
