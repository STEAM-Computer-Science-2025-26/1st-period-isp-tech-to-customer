// tests/helpers/globalTeardown.mjs
// Kills the server spawned by globalSetup after all tests complete.

import { readFileSync, rmSync } from "fs";
import { join } from "path";
import os from "os";

const PID_FILE = join(os.tmpdir(), "tech-to-customer-test-server.pid");

function readPidFile() {
	try {
		const text = readFileSync(PID_FILE, "utf8").trim();
		const pid = Number.parseInt(text, 10);
		return Number.isFinite(pid) ? pid : null;
	} catch {
		return null;
	}
}

function clearPidFile() {
	try {
		rmSync(PID_FILE, { force: true });
	} catch {
		// ignore
	}
}

export default async function globalTeardown() {
	const pid = process.__TEST_SERVER_PID__ ?? readPidFile();
	if (!pid) return; // server was pre-existing, don't kill it
	try {
		process.kill(pid, "SIGTERM");
		console.log(`\n[globalTeardown] Killed server (PID ${pid})\n`);
	} catch {
		// Already exited — fine
	} finally {
		clearPidFile();
	}
}
