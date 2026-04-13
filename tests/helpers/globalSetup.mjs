// tests/helpers/globalSetup.mjs
// ESM format required because package.json has "type": "module"
// Runs once before all Jest test suites to start the backend server.

import { spawn, execFile } from "child_process";
import { fileURLToPath } from "url";
import { dirname, resolve, join } from "path";
import { readFileSync, rmSync, writeFileSync } from "fs";
import os from "os";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const SERVER_URL = "http://localhost:3001/health";
const TIMEOUT_MS = 20_000;
const POLL_INTERVAL_MS = 250;
const PID_FILE = join(os.tmpdir(), "tech-to-customer-test-server.pid");
const SERVER_PORT = 3001;

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

async function findPidByPort(port) {
	if (process.platform === "win32") {
		return new Promise((resolve) => {
			execFile("netstat", ["-ano", "-p", "tcp"], (err, stdout) => {
				if (err) return resolve(null);
				const lines = stdout.split(/\r?\n/);
				for (const line of lines) {
					if (!line.includes(`:${port}`) || !line.includes("LISTENING"))
						continue;
					const parts = line.trim().split(/\s+/);
					const pid = Number.parseInt(parts[parts.length - 1], 10);
					if (Number.isFinite(pid)) return resolve(pid);
				}
				return resolve(null);
			});
		});
	}

	return new Promise((resolve) => {
		execFile("lsof", ["-ti", `:${port}`], (err, stdout) => {
			if (err) return resolve(null);
			const pid = Number.parseInt(stdout.split(/\r?\n/)[0], 10);
			return resolve(Number.isFinite(pid) ? pid : null);
		});
	});
}

export default async function globalSetup() {
	const existingPid = readPidFile();
	if (existingPid) {
		try {
			process.kill(existingPid, "SIGTERM");
			clearPidFile();
			// Give the port a moment to free.
			await new Promise((r) => setTimeout(r, 250));
		} catch {
			clearPidFile();
		}
	}

	// Skip if server is already running (e.g. you started it manually)
	try {
		const res = await fetch(SERVER_URL);
		if (res.ok) {
			const pid = await findPidByPort(SERVER_PORT);
			if (pid) {
				try {
					process.kill(pid, "SIGTERM");
					await new Promise((r) => setTimeout(r, 250));
				} catch {
					console.log(
						"\n[globalSetup] Server already running — using existing process.\n"
					);
					return;
				}
			} else {
				console.log(
					"\n[globalSetup] Server already running — skipping spawn.\n"
				);
				return;
			}
		}
	} catch {
		// Not up yet — continue to spawn
	}

	console.log("\n[globalSetup] Starting backend server...");

	const root = resolve(__dirname, "../../");
	const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
	const useShell = process.platform === "win32";
	const env = {
		...process.env,
		NODE_ENV: "test",
		LOG_LEVEL: "warn"
	};

	if (process.platform === "win32") {
		const pnpmHome =
			process.env.PNPM_HOME ||
			(process.env.APPDATA ? join(process.env.APPDATA, "npm") : "");
		if (pnpmHome && !env.PATH?.includes(pnpmHome)) {
			env.PATH = `${env.PATH || ""};${pnpmHome}`;
		}
	}

	await new Promise((resolveReady, reject) => {
		const server = spawn(pnpmCommand, ["exec", "tsx", "services/server.ts"], {
			cwd: root,
			shell: useShell,
			detached: true,
			stdio: "ignore",
			env
		});

		process.__TEST_SERVER_PID__ = server.pid;
		writeFileSync(PID_FILE, String(server.pid));
		server.unref();

		const timer = setTimeout(() => {
			reject(
				new Error(
					`[globalSetup] Server did not become ready within ${TIMEOUT_MS}ms`
				)
			);
		}, TIMEOUT_MS);

		server.once("error", (err) => {
			clearTimeout(timer);
			reject(new Error(`[globalSetup] Spawn failed: ${err.message}`));
		});

		server.once("exit", (code) => {
			clearTimeout(timer);
			reject(
				new Error(
					`[globalSetup] Server exited with code ${code ?? "unknown"} before ready`
				)
			);
		});

		const poll = async () => {
			try {
				const res = await fetch(SERVER_URL);
				if (res.ok) {
					clearTimeout(timer);
					server.removeAllListeners("exit");
					console.log(`[globalSetup] Server ready (PID ${server.pid})\n`);
					resolveReady();
					return;
				}
			} catch {
				// Not ready yet.
			}

			setTimeout(poll, POLL_INTERVAL_MS);
		};

		poll();
	});
}
