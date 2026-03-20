// tests/helpers/globalTeardown.mjs
// Kills the server spawned by globalSetup after all tests complete.

export default async function globalTeardown() {
	const pid = process.__TEST_SERVER_PID__;
	if (!pid) return; // server was pre-existing, don't kill it
	try {
		process.kill(pid, "SIGTERM");
		console.log(`\n[globalTeardown] Killed server (PID ${pid})\n`);
	} catch {
		// Already exited — fine
	}
}
