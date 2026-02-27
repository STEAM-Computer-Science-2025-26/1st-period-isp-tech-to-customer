// services/types/technicianInput.ts
export const createMockTechnician = (overrides = {}) => {
	return {
		id: "tech-001",
		name: "Alice Example",
		companyId: "comp-123",
		isActive: true,
		isAvailable: true,
		currentJobsCount: 0,
		maxConcurrentJobs: 3,
		dailyJobCount: 0,
		recentJobCount: 15,
		recentCompletionRate: 0.9,
		latitude: 40.7128,
		longitude: -74.006,
		maxTravelDistanceMiles: 50,
		skills: ["hvac_repair", "plumbing"],
		skillLevel: { hvac_repair: 3, plumbing: 2 },
		customerSatisfactionScore: 95,
		averageCompletionTimeMins: 60,
		emergencyResponseScore: 90,
		certifiedForGas: true,
		certifiedForElectric: false,
		ownsTruck: true,
		ownsTools: true,
		yearsExperience: 5,
		lastActiveDate: new Date(),
		...overrides
	};
};
