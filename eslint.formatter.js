/* eslint-disable @typescript-eslint/no-require-imports */
const { ESLint } = require("eslint");

module.exports = async function (results, context) {
	const totalErrors = results.reduce((sum, r) => sum + r.errorCount, 0);
	const totalWarnings = results.reduce((sum, r) => sum + r.warningCount, 0);

	// 1. Check for success (no errors and no warnings)
	if (totalErrors === 0 && totalWarnings === 0) {
		return "You did it twin 🥲  You actually did it. No errors or warnings ❤️‍🩹  \nNow checking with prettier to make sure all your code looks nice\n";
	}

	// 2. Otherwise, load and use the built-in 'stylish' formatter
	const eslint = new ESLint();
	const stylish = await eslint.loadFormatter("stylish");

	return stylish.format(results, context);
};
