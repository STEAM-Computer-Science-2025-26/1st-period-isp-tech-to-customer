import { execSync } from "node:child_process";

function run(command, description) {
	console.log(`\n[setup] ${description}`);
	execSync(command, { stdio: "inherit" });
}

function hasPnpm() {
	try {
		execSync("pnpm --version", { stdio: "ignore" });
		return true;
	} catch {
		return false;
	}
}

try {
	if (!hasPnpm()) {
		run("npm install -g pnpm", "pnpm not found, installing globally");
	} else {
		console.log("\n[setup] pnpm is already installed");
	}

	run("git pull", "pulling latest changes");
	run("pnpm install", "installing dependencies");
	run("pnpm run prepare", "starting Husky");

	console.log("\n[setup] Workspace is ready");
} catch (error) {
	console.error("\n[setup] Setup failed");
	console.error(error);
	process.exit(1);
}
