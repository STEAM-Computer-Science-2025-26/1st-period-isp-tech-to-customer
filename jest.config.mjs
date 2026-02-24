/** @type {import('jest').Config} */
const config = {
	// Use ts-jest to handle TypeScript files
	preset: "ts-jest/presets/default-esm",

	// Node test environment (no browser APIs needed)
	testEnvironment: "node",

	// Find test files — covers tests/**/*.test.ts
	testMatch: ["**/tests/**/*.test.ts"],

	// Ignore compiled output and node_modules
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],

	// Transform TypeScript with ts-jest in ESM mode
	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: {
					// Relax strict settings that break in test context
					module: "esnext",
					moduleResolution: "node",
					allowImportingTsExtensions: false,
					noEmit: false,
					esModuleInterop: true,
					strict: false,
				},
			},
		],
	},

	// Needed for ESM + ts-jest
	extensionsToTreatAsEsm: [".ts"],

	// Resolve .ts files
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

	// Map @ alias to project root (matches tsconfig.json paths)
	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1",
	},

	// Per-test timeout — Neon HTTP calls can be slow on cold start
	testTimeout: 30000,

	// Show individual test names in output
	verbose: true,

	// Run test suites sequentially (avoids DB race conditions between suites)
	runInBand: true,
};

export default config;