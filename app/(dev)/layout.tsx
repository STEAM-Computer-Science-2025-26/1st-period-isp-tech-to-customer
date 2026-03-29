import { notFound } from "next/navigation";

/**
 * Guards all routes in the (dev) group.
 * Set NEXT_PUBLIC_ENABLE_DEV_TOOLS=true in .env.local to enable.
 */
export default function DevLayout({ children }: { children: React.ReactNode }) {
	if (process.env.NEXT_PUBLIC_ENABLE_DEV_TOOLS !== "true") {
		notFound();
	}
	return <>{children}</>;
}
