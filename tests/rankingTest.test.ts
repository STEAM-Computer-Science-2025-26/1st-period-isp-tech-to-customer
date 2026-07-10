// __tests__/ranking.test.ts

import {
	rankTechnicians,
	createRecommendation,
	formatRecommendation
} from "../algo/ranker";

describe("Stage 4 — Ranking & Assignment", () => {
	test("5.6.1 — clear winner ranks first", () => {
		const scores = [
			{
				techId: "tech-001",
				techName: "Alice",
				totalScore: 100,
				performanceScore: 10,
				distanceMiles: 0,
				workloadScore: 10
			},
			{
				techId: "tech-002",
				techName: "Bob",
				totalScore: 75,
				performanceScore: 8,
				distanceMiles: 20,
				workloadScore: 5
			}
		];

		const ranked = rankTechnicians(scores);
		expect(ranked[0].techId).toBe("tech-001");
	});

	test("5.6.2 — tiebreaker: higher performance wins", () => {
		const scores = [
			{
				techId: "tech-001",
				techName: "Alice",
				totalScore: 90,
				performanceScore: 10,
				distanceMiles: 10,
				workloadScore: 10
			},
			{
				techId: "tech-002",
				techName: "Bob",
				totalScore: 90,
				performanceScore: 8,
				distanceMiles: 10,
				workloadScore: 10
			}
		];

		const ranked = rankTechnicians(scores, 0.1);
		expect(ranked[0].techId).toBe("tech-001");
	});

	test("5.6.3 — tiebreaker: shorter distance wins", () => {
		const scores = [
			{
				techId: "tech-001",
				techName: "Alice",
				totalScore: 90,
				performanceScore: 10,
				distanceMiles: 5,
				workloadScore: 10
			},
			{
				techId: "tech-002",
				techName: "Bob",
				totalScore: 90,
				performanceScore: 10,
				distanceMiles: 15,
				workloadScore: 10
			}
		];

		const ranked = rankTechnicians(scores, 0.1);
		expect(ranked[0].techId).toBe("tech-001");
	});

	test("5.6.4 — tiebreaker: higher workloadScore wins", () => {
		const scores = [
			{
				techId: "tech-001",
				techName: "Alice",
				totalScore: 90,
				performanceScore: 10,
				distanceMiles: 10,
				workloadScore: 10
			},
			{
				techId: "tech-002",
				techName: "Bob",
				totalScore: 90,
				performanceScore: 10,
				distanceMiles: 10,
				workloadScore: 5
			}
		];

		const ranked = rankTechnicians(scores, 0.1);
		expect(ranked[0].techId).toBe("tech-001");
	});

	test("5.6.5 — createRecommendation returns top 3 and assigns #1", () => {
		const scores = [
			{
				techId: "tech-001",
				techName: "Alice",
				totalScore: 100,
				performanceScore: 10,
				distanceMiles: 0,
				workloadScore: 10
			},
			{
				techId: "tech-002",
				techName: "Bob",
				totalScore: 90,
				performanceScore: 9,
				distanceMiles: 5,
				workloadScore: 8
			},
			{
				techId: "tech-003",
				techName: "Carol",
				totalScore: 80,
				performanceScore: 8,
				distanceMiles: 10,
				workloadScore: 7
			},
			{
				techId: "tech-004",
				techName: "Dave",
				totalScore: 65,
				performanceScore: 7,
				distanceMiles: 15,
				workloadScore: 6
			}
		];

		const rec = createRecommendation("job-001", scores, false);

		expect(rec.totalEligibleTechs).toBe(4);
		expect(rec.recommendations.length).toBe(3);
		expect(rec.assignedTech?.techId).toBe("tech-001");
	});

	test("5.6.6 — no eligible techs requires manual dispatch", () => {
		const rec = createRecommendation("job-002", [], false);

		expect(rec.totalEligibleTechs).toBe(0);
		expect(rec.assignedTech).toBeNull();
		expect(rec.requiresManualDispatch).toBe(true);
	});

	test("5.6.7 — formatRecommendation produces readable output", () => {
		const rec = createRecommendation(
			"job-001",
			[
				{
					techId: "tech-001",
					techName: "Alice",
					totalScore: 100,
					performanceScore: 10,
					distanceMiles: 0,
					workloadScore: 10
				}
			],
			false
		);

		const text = formatRecommendation(rec);

		expect(text).toContain("DISPATCH RECOMMENDATION");
		expect(text).toContain("Job ID: job-001");
	});

	test("5.6.8 — emergency flag is preserved", () => {
		const rec = createRecommendation(
			"job-003",
			[
				{
					techId: "tech-001",
					techName: "Alice",
					totalScore: 100,
					performanceScore: 10,
					distanceMiles: 0,
					workloadScore: 0
				}
			],
			true
		);

		expect(rec.isEmergency).toBe(true);
	});
});
