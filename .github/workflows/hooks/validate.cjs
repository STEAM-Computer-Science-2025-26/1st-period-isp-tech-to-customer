const { execSync } = require("child_process");

let input = "";

process.stdin.on("data", (chunk) => {
	input += chunk;
});

process.stdin.on("end", () => {
	try {
		const data = JSON.parse(input);

		if (data.toolName !== "edit") {
			return ok();
		}

		let args = {};
		try {
			args = JSON.parse(data.toolArgs);
		} catch {
			return ok();
		}

		const filePath = args.filePath || args.path || args.file_name || "";

		if (!filePath) return ok();

		const ext = filePath.split(".").pop().toLowerCase();

		let errors = [];

		if (["ts", "tsx", "jsx", "html"].includes(ext)) {
			console.log("HOOK TRIGGERED TYPE: ESLINT");
			try {
				execSync(`npx eslint --fix "${filePath}"`, { stdio: "pipe" });
			} catch (e) {}

			try {
				execSync(`npx eslint "${filePath}"`, { stdio: "pipe" });
			} catch (e) {
				errors.push(
					"ESLint errors:\n" + (e.stdout?.toString() || e.stderr?.toString())
				);
			}
		}

		if (["ts", "tsx"].includes(ext)) {
			console.log("HOOK TRIGGERED TYPE: TSC");
			try {
				execSync(`npx tsc --noEmit --incremental`, { stdio: "pipe" });
			} catch (e) {
				errors.push(
					"TypeScript errors:\n" +
						(e.stdout?.toString() || e.stderr?.toString())
				);
			}
		}

		if (errors.length > 0) {
			process.stdout.write(
				JSON.stringify({
					continue: false,
					stopReason: "Validation failed",
					systemMessage: errors.join("\n\n")
				})
			);
			process.exit(0);
		}

		return ok();
	} catch (err) {
		console.error("Hook crash:", err);
		return ok();
	}
});

function ok() {
	process.stdout.write(JSON.stringify({ continue: true }));
}
