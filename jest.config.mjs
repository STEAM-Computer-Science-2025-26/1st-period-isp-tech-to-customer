// jest.config.mjs
import { defaults } from "jest-config";

export default {
	testEnvironment: "node",
	moduleFileExtensions: ["js", "ts"],
	transform: {
		"^.+\\.ts$": "ts-jest"
	},
	testMatch: ["**/tests/**/*.ts"]
};
