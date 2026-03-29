import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
	...nextVitals,
	...nextTs,
	{
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
			"@typescript-eslint/no-require-imports": "off",
			"@typescript-eslint/no-empty-object-type": "off",
			"react-hooks/refs": "off",
			"react-hooks/set-state-in-effect": "off",
			"react/no-unescaped-entities": "off",
			"prefer-const": "warn"
		}
	},
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
