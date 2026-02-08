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
	manualDispatchReason?: string; // optional field for manual dispatch cases
};

/*
tiebreaker

compare performance scores
compare distances
compare workload scores
compare IDs
*/

function compareTechnicians(a: TechnicianScore, b: TechnicianScore): number {
	if (a.totalScore !== b.totalScore) {
		return b.totalScore - a.totalScore; // higher total score wins
	}
	if (a.distanceMiles !== b.distanceMiles) {
		return a.distanceMiles - b.distanceMiles; // lower distance wins
	}
	if (a.workloadScore !== b.workloadScore) {
		return b.workloadScore - a.workloadScore; // higher workload score wins
	}
	return a.techId.localeCompare(b.techId); // lexicographical order of IDs
}

/*
ranks techs by score

sorts by total score
if score falls within tiebreaker, apply tiebreaker
return array(sorted)
*/

export function rankTechnicians(
	scores: TechnicianScore[],
	tieThreshold: number = 0.1
): TechnicianScore[] {
	const sorted = [...scores].sort((a, b) => {
		const scoreDiff = Math.abs(a.totalScore - b.totalScore);
		if (scoreDiff <= tieThreshold) {
			return compareTechnicians(a, b);
		}
		return b.totalScore - a.totalScore; // higher total score wins
	});
	return sorted;
}

/*
handle no eligible techs case
rank all techs
take top 3 for recommendations
auto-assigns number 1 ranked tech(idk, ill mark it starts so we can delete it)
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
			timestamp
		};
	}
	const tieThreshold = 0.1; // or any appropriate default value
	const ranked = rankTechnicians(scores, tieThreshold);
	const top3 = ranked.slice(0, 3);
	//start here
	const assignedTech = ranked[0];
	return {
		jobId,
		recommendations: top3,
		assignedTech,
		totalEligibleTechs: scores.length,
		requiresManualDispatch: true, // we can change this to false if we want to auto-assign the top tech
		isEmergency,
		timestamp
	};
}

/*
creates a header with job info
handles manual dispatch case
show assigned tech
list top 3 recommendations with scores and distance
*/
//AI GENERATED FORMAT FOR DISPATCH RECOMMENDATION
export function formatRecommendation(rec: DispatchRecommendation): string {
	let output = `\n📋 DISPATCH RECOMMENDATION\n`;
	output += `${"=".repeat(60)}\n`;
	output += `Job ID: ${rec.jobId}\n`;
	output += `Priority: ${rec.isEmergency ? "🚨 EMERGENCY" : "Normal"}\n`;
	output += `Eligible Techs: ${rec.totalEligibleTechs}\n`;
	output += `Timestamp: ${new Date(rec.timestamp).toLocaleString()}\n\n`;

	if (rec.requiresManualDispatch) {
		output += `⚠️  MANUAL DISPATCH REQUIRED\n`;
		output += `Reason: ${rec.manualDispatchReason}\n`;
		return output;
	}

	output += `✅ AUTO-ASSIGNED: ${rec.assignedTech!.techName}\n`;
	output += `   Score: ${rec.assignedTech!.totalScore}/100\n`;
	output += `   Distance: ${rec.assignedTech!.distanceMiles.toFixed(1)} km\n\n`;

	output += `TOP 3 RECOMMENDATIONS:\n`;
	rec.recommendations.forEach((tech, index) => {
		output += `\n${index + 1}. ${tech.techName} (${tech.totalScore}/100 points)\n`;
		output += `   Distance: ${tech.distanceMiles.toFixed(1)} km\n`;
	});

	return output;
}
