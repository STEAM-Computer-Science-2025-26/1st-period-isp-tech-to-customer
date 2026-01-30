import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	{
		files: [
			"app/api/dev/db/**/*.ts",
			"components/dev/db/**/*.ts",
			"components/dev/db/**/*.tsx"
		],
		rules: {
			"@typescript-eslint/no-explicit-any": "off"
		}
	},
	// Override default ignores of eslint-config-next.
	globalIgnores([
		// Default ignores of eslint-config-next:
		".next/**",
		"out/**",
		"build/**",
		"next-env.d.ts"
	])
]);

export default eslintConfig;
