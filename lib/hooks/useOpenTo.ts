import { useRouter } from "next/navigation";
import { useCallback } from "react";

/**
 * Navigate to the jobs list and open a specific job.
 * view="panel" opens the side panel (default); view="full" navigates to the full job detail page.
 */
export function useOpenToJob() {
	const router = useRouter();
	return useCallback(
		(jobId: string, view: "panel" | "full" = "panel") => {
			if (view === "full") {
				router.push(`/jobs/${encodeURIComponent(jobId)}`);
			} else {
				router.push(`/jobs?job=${encodeURIComponent(jobId)}&view=panel`);
			}
		},
		[router]
	);
}

/**
 * Navigate to the customers list and open a specific customer.
 * view="panel" opens the side panel (default); view="full" navigates to the full customer detail page.
 */
export function useOpenToCustomer() {
	const router = useRouter();
	return useCallback(
		(customerId: string, view: "panel" | "full" = "panel") => {
			if (view === "full") {
				router.push(`/customers/${encodeURIComponent(customerId)}`);
			} else {
				router.push(
					`/customers?customer=${encodeURIComponent(customerId)}&view=panel`
				);
			}
		},
		[router]
	);
}

/**
 * Navigate to the map page and highlight a specific job (selecting it in the side panel
 * and panning the map to its location).
 */
export function useOpenToJobOnMap() {
	const router = useRouter();
	return useCallback(
		(jobId: string) => {
			router.push(`/map?job=${encodeURIComponent(jobId)}`);
		},
		[router]
	);
}

/**
 * Navigate to the map page and pan/zoom to a specific lat/lng coordinate.
 */
export function useOpenToLocation() {
	const router = useRouter();
	return useCallback(
		(lat: number, lng: number) => {
			router.push(`/map?lat=${lat}&lng=${lng}`);
		},
		[router]
	);
}

/**
 * Navigate to the dispatch page and open a specific job in the dispatch panel.
 * The job must be in the unassigned queue to appear.
 */
export function useOpenToJobInDispatch() {
	const router = useRouter();
	return useCallback(
		(jobId: string) => {
			router.push(`/dispatch?job=${encodeURIComponent(jobId)}`);
		},
		[router]
	);
}
