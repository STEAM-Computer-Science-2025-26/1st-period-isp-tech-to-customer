"use client";

import MainContent from "@/components/layout/MainContent";
import SidePanel from "@/components/layout/SidePanel";
import { cn } from "@/lib/utils";
import { APIProvider, Map } from "@vis.gl/react-google-maps";

const MapPage = () => {
	const MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
	return (
		<MainContent>
			<APIProvider apiKey={MAPS_API_KEY}>
				<Map
					className={cn(`fixed h-dvh w-dvw top-0 left-0`)}
					defaultCenter={{ lat: 22.54992, lng: 0 }}	
					defaultZoom={3}
					gestureHandling="greedy"
					disableDefaultUI
				/>
			</APIProvider>
			<SidePanel />
		</MainContent>
	);
};

export default MapPage;