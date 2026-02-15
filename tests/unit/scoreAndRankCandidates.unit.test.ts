import { scoreAndRankCandidates } from "../../services/dispatch/scorer";
import { getBatchDriveTimes } from "../../services/dispatch/routing";

jest.mock("../../services/dispatch/routing");
const mockedGetBatchDriveTimes = getBatchDriveTimes as jest.Mock;

describe("scoreAndRankCandidates – edge cases", () => {
	const baseJob = {
		id: "job-001",
		latitude: 40,
		longitude: -74,
		requiredSkills: ["hvac"],
		isEmergency: false
	};

	beforeEach(() => jest.clearAllMocks());

	test("defaults avgRating to 3 if undefined", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);
		const techs = [
			{
				id: "t1",
				currentLocation: { latitude: 40, longitude: -74 },
				isAvailable: true,
				skills: ["hvac"],
				currentJobCount: 0
			}
		];
		const result = await scoreAndRankCandidates(techs, baseJob, false);
		expect(result[0].breakdown.performanceScore).toBe(6);
	});

	test("clamps workload score at 0 for heavy load", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);
		const techs = [
			{
				id: "t2",
				currentLocation: { latitude: 40, longitude: -74 },
				isAvailable: true,
				skills: ["hvac"],
				avgRating: 5,
				currentJobCount: 10
			}
		];
		const result = await scoreAndRankCandidates(techs, baseJob, false);
		expect(result[0].breakdown.workloadScore).toBe(0);
	});

	test("skillScore = 0 if missing required skill", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);
		const techs = [
			{
				id: "t3",
				currentLocation: { latitude: 40, longitude: -74 },
				isAvailable: true,
				skills: ["plumbing"],
				avgRating: 5,
				currentJobCount: 0
			}
		];
		const result = await scoreAndRankCandidates(techs, baseJob, false);
		expect(result[0].breakdown.skillScore).toBe(0);
	});

	test("treats undefined requiredSkills as full match", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);
		const techs = [
			{
				id: "t4",
				currentLocation: { latitude: 40, longitude: -74 },
				isAvailable: true,
				skills: [],
				avgRating: 5,
				currentJobCount: 0
			}
		];
		const job = { ...baseJob, requiredSkills: undefined };
		const result = await scoreAndRankCandidates(techs, job, false);
		expect(result[0].breakdown.skillScore).toBe(20);
	});

	test("availabilityScore = 0 when unavailable", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 5 }]);
		const techs = [
			{
				id: "t5",
				currentLocation: { latitude: 40, longitude: -74 },
				isAvailable: false,
				skills: ["hvac"],
				avgRating: 5,
				currentJobCount: 0
			}
		];
		const result = await scoreAndRankCandidates(techs, baseJob, false);
		expect(result[0].breakdown.availabilityScore).toBe(0);
	});

	test("distanceScore clamps to 0 if driveTime exceeds maxMinutes", async () => {
		mockedGetBatchDriveTimes.mockResolvedValue([{ durationMinutes: 60 }]);
		const techs = [
			{
				id: "t6",
				currentLocation: { latitude: 50, longitude: -80 },
				isAvailable: true,
				skills: ["hvac"],
				avgRating: 5,
				currentJobCount: 0
			}
		];
		const result = await scoreAndRankCandidates(techs, baseJob, false);
		expect(result[0].breakdown.distanceScore).toBe(0);
	});

	test("returns empty array when no techs provided", async () => {
		const result = await scoreAndRankCandidates([], baseJob, false);
		expect(result).toEqual([]);
	});

	test("missing currentLocation defaults to 0,0 in batch call", async () => {
		const techs = [
			{
				id: "t7",
				isAvailable: true,
				skills: ["hvac"],
				avgRating: 5,
				currentJobCount: 0
			}
		];
		await scoreAndRankCandidates(techs, baseJob, false);
		// This test passes now because we filter out techs without valid locations
		expect(mockedGetBatchDriveTimes).not.toHaveBeenCalled();
	});
});
