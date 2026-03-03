"use client";

import MainContent from "@/components/layout/MainContent";
import { DevDbTools } from "@/components/dev/db/DevDbTools";

export default function DevPage() {
	return (
		<>
			<MainContent>
				<DevDbTools />
			</MainContent>
		</>
	);
}
