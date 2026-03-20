/** @type {import('jest').Config} */
const config = {
	preset: "ts-jest/presets/default-esm",
	testEnvironment: "node",
	testMatch: ["**/tests/**/*.test.ts"],
	testPathIgnorePatterns: ["/node_modules/", "/dist/"],

	transform: {
		"^.+\\.tsx?$": [
			"ts-jest",
			{
				useESM: true,
				tsconfig: {
					module: "esnext",
					moduleResolution: "node",
					allowImportingTsExtensions: false,
					noEmit: false,
					esModuleInterop: true,
					strict: false
				}
			}
		]
	},

	extensionsToTreatAsEsm: [".ts"],
	moduleFileExtensions: ["ts", "tsx", "js", "jsx", "json"],

	moduleNameMapper: {
		"^@/(.*)$": "<rootDir>/$1"
	},

	// Must be .mjs (ESM) because package.json has "type": "module"
	// globalSetup/Teardown run outside ts-jest so they can't be .ts
	globalSetup: "./tests/helpers/globalSetup.mjs",
	globalTeardown: "./tests/helpers/globalTeardown.mjs",

	testTimeout: 30000,
	verbose: true
};

export default config;
