// jest.config.mjs
const config = {
	testEnvironment: "node",
	moduleFileExtensions: ["js", "ts"],
	transform: {
		"^.+\\.ts$": "ts-jest"
	},
	testMatch: ["**/tests/**/*.ts"]
};

export default config;
