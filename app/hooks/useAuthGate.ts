"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isTokenValid } from "@/lib/auth";

type UseAuthGateOptions = {
	publicPaths?: string[];
	redirectTo?: string;
};

const DEFAULT_PUBLIC_PATHS = ["/login", "/verify"];

export function useAuthGate(options: UseAuthGateOptions = {}): void {
	const router = useRouter();
	const pathname = usePathname();
	const publicPaths = options.publicPaths ?? DEFAULT_PUBLIC_PATHS;
	const redirectTo = options.redirectTo ?? "/login";

	useEffect(() => {
		if (!pathname) return;
		const isPublic = publicPaths.some(
			(path) => pathname === path || pathname.startsWith(`${path}/`)
		);
		if (isPublic) return;
		if (isTokenValid()) return;
		router.replace(redirectTo);
	}, [pathname, publicPaths, redirectTo, router]);
}
