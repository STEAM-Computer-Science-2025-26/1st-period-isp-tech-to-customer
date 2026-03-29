export type TechScore = {
	techId: string;
	techName: string;
	totalScore: number;
	performanceScore: number;
	distanceMiles: number;
	workloadScore: number;
};

export type DispatchRecommendation = {
	jobId: string;
	recommendations: TechScore[];
	assignedTech: TechScore | null;
	totalEligibleTechs: number;
	requiresManualDispatch: boolean;
	isEmergency: boolean;
	timestamp: string;
	manualDispatchReason?: string;
};
