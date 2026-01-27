"use client";

import { useState } from "react";

export function CopyCode({ code }: { code: string }) {
	const [copied, setCopied] = useState(false);

	return (
		<div className="flex flex-col items-center gap-3">
			<div className="text-3xl tracking-[0.35em] font-mono text-accent-text">
				{code}
			</div>
			<button
				type="button"
				className="h-10 px-4 rounded-lg bg-accent-main text-background-primary font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
				disabled={copied}
				onClick={async () => {
					try {
						await navigator.clipboard.writeText(code);
						setCopied(true);
						window.setTimeout(() => setCopied(false), 2000);
					} catch {
						// Ignore clipboard errors.
					}
				}}
			>
				{copied ? "Copied" : "Copy code"}
			</button>
		</div>
	);
}
