const config = {
	testEnvironment: "node",
	moduleFileExtensions: ["js", "ts"],
	transform: {
		"^.+\\.ts$": "ts-jest"
	},
	testMatch: ["**/tests/**/*.ts"],
	preset: "ts-jest"
};

export default config;
