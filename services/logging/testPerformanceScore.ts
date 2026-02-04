import { computeRecentPerformanceScore } from "./completionLogger";

function assertEqual(a: unknown, b: unknown, label: string) {
	if (a !== b) {
		console.error(`FAIL ${label}: expected ${b}, got ${a}`);
		process.exitCode = 1;
	} else {
		console.log(`PASS ${label}`);
	}
}

// Unit test scenarios
console.log("Running performance score unit scenarios...");

// Perfect tech
assertEqual(computeRecentPerformanceScore(5, 1, 30) >= 0.9, true, "perfect tech");

// Poor tech
assertEqual(computeRecentPerformanceScore(2, 0, 180) <= 0.2, true, "poor tech");

// Null/undefined inputs fallback
assertEqual(
	typeof computeRecentPerformanceScore(null, null, null) === "number",
	true,
	"null inputs"
);

// Edge: zero avg duration
assertEqual(
	computeRecentPerformanceScore(5, 1, 0) === computeRecentPerformanceScore(5, 1, null),
	true,
	"zero duration treated as null"
);

// Edge: avg duration exactly 120 mins
assertEqual(
	computeRecentPerformanceScore(5, 1, 120) < 1,
	true,
	"duration 120 mins reduces duration score"
);

console.log("Done.");
