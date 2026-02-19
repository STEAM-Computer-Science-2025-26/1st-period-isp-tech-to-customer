import {
	dispatch,
	batchDispatch,
	overrideAssignment,
	getDispatchStats
} from "../algo/main-dispatch";
import { TechnicianInput } from "../services/types/technicianInput";

describe("Main Dispatch Integration Tests", () => {
	const technicians: TechnicianInput[] = [
		{
			id: "tech-001",
			name: "Alice Perfect",
			companyId: "company-123",
			isActive: true,
			isAvailable: true,
			currentJobsCount: 0,
			maxConcurrentJobs: 3,
			latitude: 32.7767,
			longitude: -96.797,
			maxTravelDistanceMiles: 100,
			skills: ["hvac_repair", "hvac_maintenance"],
			skillLevel: { hvac_repair: 3, hvac_maintenance: 2 },
			recentCompletionRate: 0.98,
			recentJobCount: 15,
			dailyJobCount: 0,
			distanceMiles: 0
		},
		{
			id: "tech-002",
			name: "Bob Nearby",
			companyId: "company-123",
			isActive: true,
			isAvailable: true,
			currentJobsCount: 1,
			maxConcurrentJobs: 3,
			latitude: 32.8,
			longitude: -96.8,
			maxTravelDistanceMiles: 75,
			skills: ["hvac_repair", "electrical"],
			skillLevel: { hvac_repair: 2, electrical: 3 },
			recentCompletionRate: 0.92,
			recentJobCount: 12,
			dailyJobCount: 1,
			distanceMiles: 2
		},
		{
			id: "tech-003",
			name: "Carol Busy",
			companyId: "company-123",
			isActive: true,
			isAvailable: true,
			currentJobsCount: 2,
			maxConcurrentJobs: 3,
			latitude: 32.75,
			longitude: -96.75,
			maxTravelDistanceMiles: 100,
			skills: ["hvac_repair", "hvac_install"],
			skillLevel: { hvac_repair: 2, hvac_install: 2 },
			recentCompletionRate: 0.88,
			recentJobCount: 10,
			dailyJobCount: 3,
			distanceMiles: 5
		},
		{
			id: "tech-004",
			name: "Dave Unavailable",
			companyId: "company-123",
			isActive: true,
			isAvailable: false,
			currentJobsCount: 0,
			maxConcurrentJobs: 3,
			latitude: 32.77,
			longitude: -96.79,
			maxTravelDistanceMiles: 100,
			skills: ["hvac_repair"],
			skillLevel: { hvac_repair: 3 },
			recentCompletionRate: 0.95,
			recentJobCount: 10,
			dailyJobCount: 0,
			distanceMiles: 1
		}
	];

	test("6.3.2 Normal Priority Job", () => {
		const normalJob = {
			id: "job-001",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "123 Main St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const result = dispatch(normalJob, technicians);
		expect(result.assignedTech?.techId).toBe("tech-001");
	});

	test("6.3.3 Emergency Priority Job", () => {
		const emergencyJob = {
			id: "job-002",
			companyId: "company-123",
			jobType: "repair",
			priority: "emergency",
			address: "456 Oak Ave, Dallas, TX",
			latitude: 32.75,
			longitude: -96.75,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const result = dispatch(emergencyJob, technicians);
		expect(result.isEmergency).toBe(true);
	});

	test("6.3.4 No Eligible Technicians", () => {
		const impossibleJob = {
			id: "job-003",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "789 Elm St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["plumbing"],
			minimumSkillLevel: 2
		};

		const result = dispatch(impossibleJob, technicians);
		expect(result.requiresManualDispatch).toBe(true);
	});

	test("6.3.5 Batch Dispatch", () => {
		const normalJob = {
			id: "job-001",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "123 Main St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const emergencyJob = {
			id: "job-002",
			companyId: "company-123",
			jobType: "repair",
			priority: "emergency",
			address: "456 Oak Ave, Dallas, TX",
			latitude: 32.75,
			longitude: -96.75,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const impossibleJob = {
			id: "job-003",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "789 Elm St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["plumbing"],
			minimumSkillLevel: 2
		};

		const jobs = [normalJob, emergencyJob, impossibleJob];
		const results = batchDispatch(jobs, technicians);

		expect(results.length).toBe(3);
		expect(results.filter((r) => r.requiresManualDispatch).length).toBe(1);
	});

	test("6.3.6 Manual Override", () => {
		const normalJob = {
			id: "job-001",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "123 Main St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const result = dispatch(normalJob, technicians);
		const overridden = overrideAssignment(
			result,
			"tech-002",
			"Bob has existing customer relationship with this client"
		);

		expect(overridden.assignedTech?.techId).toBe("tech-002");
		expect(overridden.override?.reason).toContain("Bob has existing");
	});

	test("6.3.7 Dispatch Statistics", () => {
		const normalJob = {
			id: "job-001",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "123 Main St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const emergencyJob = {
			id: "job-002",
			companyId: "company-123",
			jobType: "repair",
			priority: "emergency",
			address: "456 Oak Ave, Dallas, TX",
			latitude: 32.75,
			longitude: -96.75,
			requiredSkills: ["hvac_repair"],
			minimumSkillLevel: 2
		};

		const impossibleJob = {
			id: "job-003",
			companyId: "company-123",
			jobType: "repair",
			priority: "high",
			address: "789 Elm St, Dallas, TX",
			latitude: 32.7767,
			longitude: -96.797,
			requiredSkills: ["plumbing"],
			minimumSkillLevel: 2
		};

		const batchResults = batchDispatch(
			[normalJob, emergencyJob, impossibleJob],
			technicians
		);
		const stats = getDispatchStats(batchResults, 1);

		expect(stats.totalJobs).toBe(3);
		expect(stats.manualDispatchRequired).toBe(1);
		expect(stats.autoAssigned).toBe(2);
	});
});
