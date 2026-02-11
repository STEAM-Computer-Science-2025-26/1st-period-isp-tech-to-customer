type TechnicianScore = {
	techId: string;
	techName: string;
	totalScore: number;
	performanceScore: number;
	distanceMiles: number;
	workloadScore: number;
};

type DispatchRecommendation = {
	jobId: string;
	recommendations: TechnicianScore[];
	assignedTech: TechnicianScore | null;
	totalEligibleTechs: number;
	requiresManualDispatch: boolean;
	isEmergency: boolean;
	timestamp: string;
	manualDispatchReason?: string;
};

/*
tiebreaker priority:
1. higher total score
2. lower distance
3. higher workload score
4. lexicographic ID (deterministic)
*/
function compareTechnicians(a: TechnicianScore, b: TechnicianScore): number {
	if (a.totalScore !== b.totalScore) {
		return b.totalScore - a.totalScore;
	}
	if (a.distanceMiles !== b.distanceMiles) {
		return a.distanceMiles - b.distanceMiles;
	}
	if (a.workloadScore !== b.workloadScore) {
		return b.workloadScore - a.workloadScore;
	}
	return a.techId.localeCompare(b.techId);
}

/*
sorts by total score descending.
when two scores are within tieThreshold of each other,
falls back to compareTechnicians for a deterministic result.
*/
export function rankTechnicians(
	scores: TechnicianScore[],
	tieThreshold: number = 0.1
): TechnicianScore[] {
	return [...scores].sort((a, b) => {
		const scoreDiff = Math.abs(a.totalScore - b.totalScore);
		if (scoreDiff <= tieThreshold) {
			return compareTechnicians(a, b);
		}
		return b.totalScore - a.totalScore;
	});
}

/*
builds a DispatchRecommendation from a scored list.

- empty scores   → requiresManualDispatch: true,  assignedTech: null
- non-empty      → requiresManualDispatch: false,  assignedTech: ranked[0]

top 3 are included in recommendations for dispatcher visibility.
*/
export function createRecommendation(
	jobId: string,
	scores: TechnicianScore[],
	isEmergency: boolean
): DispatchRecommendation {
	const timestamp = new Date().toISOString();

	if (scores.length === 0) {
		return {
			jobId,
			recommendations: [],
			assignedTech: null,
			totalEligibleTechs: 0,
			requiresManualDispatch: true,
			isEmergency,
			timestamp,
			manualDispatchReason: "No eligible technicians found for this job."
		};
	}

	const ranked = rankTechnicians(scores);
	const top3 = ranked.slice(0, 3);
	const assignedTech = ranked[0];

	return {
		jobId,
		recommendations: top3,
		assignedTech,
		totalEligibleTechs: scores.length,
		requiresManualDispatch: false,
		isEmergency,
		timestamp
	};
}

/*
formats a recommendation for human-readable console/log output.

manual dispatch case: shows reason why no auto-assignment was made.
auto-assigned case:   shows the assigned tech + top 3 ranked list.

note: distance is stored as miles throughout the algo layer.
*/
export function formatRecommendation(rec: DispatchRecommendation): string {
	let output = `\n📋 DISPATCH RECOMMENDATION\n`;
	output += `${"=".repeat(60)}\n`;
	output += `Job ID: ${rec.jobId}\n`;
	output += `Priority: ${rec.isEmergency ? "🚨 EMERGENCY" : "Normal"}\n`;
	output += `Eligible Techs: ${rec.totalEligibleTechs}\n`;
	output += `Timestamp: ${new Date(rec.timestamp).toLocaleString()}\n\n`;

	if (rec.requiresManualDispatch) {
		output += `⚠️  MANUAL DISPATCH REQUIRED\n`;
		if (rec.manualDispatchReason) {
			output += `Reason: ${rec.manualDispatchReason}\n`;
		}
		return output;
	}

	// assignedTech is guaranteed non-null here because requiresManualDispatch
	// is only false when scores.length > 0 (see createRecommendation above).
	output += `✅ AUTO-ASSIGNED: ${rec.assignedTech!.techName}\n`;
	output += `   Score: ${rec.assignedTech!.totalScore}/100\n`;
	output += `   Distance: ${rec.assignedTech!.distanceMiles.toFixed(1)} mi\n\n`;

	output += `TOP ${rec.recommendations.length} RECOMMENDATIONS:\n`;
	rec.recommendations.forEach((tech, index) => {
		output += `\n${index + 1}. ${tech.techName} (${tech.totalScore}/100 points)\n`;
		output += `   Distance: ${tech.distanceMiles.toFixed(1)} mi\n`;
	});

	return output;
}