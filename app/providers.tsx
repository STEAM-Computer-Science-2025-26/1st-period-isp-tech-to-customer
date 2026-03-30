"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { useAuthGate } from "@/app/hooks/useAuthGate";

export function Providers({ children }: { children: React.ReactNode }) {
	useAuthGate();
	// useState ensures each request gets its own client (correct for SSR, harmless for CSR)
	const [queryClient] = useState(
		() =>
			new QueryClient({
				defaultOptions: {
					queries: {
						staleTime: 60_000, // 60s default — override per-hook as needed
						retry: 1, // retry once on transient network errors
						refetchOnWindowFocus: false // internal admin tool, not a live dashboard
					}
				}
			})
	);

	return (
		<QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
	);
}
