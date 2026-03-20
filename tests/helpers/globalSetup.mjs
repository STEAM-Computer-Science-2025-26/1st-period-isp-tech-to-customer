// tests/helpers/globalSetup.mjs
// ESM format required because package.json has "type": "module"
// Runs once before all Jest test suites to start the backend server.

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_READY = "Backend server started successfully";
const TIMEOUT_MS = 20_000;

export default async function globalSetup() {
	// Skip if server is already running (e.g. you started it manually)
	try {
		const res = await fetch("http://localhost:3001/health");
		if (res.ok) {
			console.log("\n[globalSetup] Server already running — skipping spawn.\n");
			return;
		}
	} catch {
		// Not up yet — continue to spawn
	}

	console.log("\n[globalSetup] Starting backend server...");

	const root = resolve(__dirname, "../../");

	await new Promise((resolve, reject) => {
		const server = spawn("pnpm", ["exec", "tsx", "services/server.ts"], {
			cwd: root,
			stdio: ["ignore", "pipe", "pipe"],
			env: {
				...process.env,
				NODE_ENV: "test",
				LOG_LEVEL: "warn"
			}
		});

		const timer = setTimeout(() => {
			server.kill();
			reject(
				new Error(
					`[globalSetup] Server did not become ready within ${TIMEOUT_MS}ms`
				)
			);
		}, TIMEOUT_MS);

		server.stdout.on("data", (buf) => {
			if (buf.toString().includes(SERVER_READY)) {
				clearTimeout(timer);
				// Store PID so globalTeardown can kill it
				process.__TEST_SERVER_PID__ = server.pid;
				console.log(`[globalSetup] Server ready (PID ${server.pid})\n`);
				resolve();
			}
		});

		server.stderr.on("data", (buf) => {
			const text = buf.toString();
			if (/error|fatal/i.test(text)) {
				process.stderr.write(`[server] ${text}`);
			}
		});

		server.on("error", (err) => {
			clearTimeout(timer);
			reject(new Error(`[globalSetup] Spawn failed: ${err.message}`));
		});

		server.on("exit", (code) => {
			if (code != null && code !== 0) {
				clearTimeout(timer);
				reject(
					new Error(
						`[globalSetup] Server exited with code ${code} before ready`
					)
				);
			}
		});
	});
}
