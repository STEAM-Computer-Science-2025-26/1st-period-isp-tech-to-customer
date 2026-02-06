import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceStaticDirs = [
	path.join(rootDir, ".open-next", "assets"),
	path.join(rootDir, ".output", "static"),
	path.join(rootDir, ".vercel", "output", "static"),
	path.join(rootDir, ".next", "static")
];
const sourceFunctionsDirs = [
	path.join(rootDir, ".output", "functions"),
	path.join(rootDir, ".vercel", "output", "functions")
];
const sourceWorkerFiles = [
	path.join(rootDir, ".open-next", "worker.js"),
	path.join(rootDir, ".output", "worker.js")
];
const distDir = path.join(rootDir, ".dist");
const functionsDir = path.join(rootDir, ".functions");

const pathExists = async (target) => {
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
};

const ensureEmptyDir = async (target) => {
	await fs.rm(target, { recursive: true, force: true });
	await fs.mkdir(target, { recursive: true });
};

const copyDir = async (source, destination) => {
	await fs.mkdir(destination, { recursive: true });
	const entries = await fs.readdir(source, { withFileTypes: true });

	for (const entry of entries) {
		const sourcePath = path.join(source, entry.name);
		const destPath = path.join(destination, entry.name);

		if (entry.isDirectory()) {
			await copyDir(sourcePath, destPath);
		} else if (entry.isFile()) {
			await fs.copyFile(sourcePath, destPath);
		}
	}
};

const firstExistingPath = async (paths) => {
	for (const candidate of paths) {
		if (await pathExists(candidate)) {
			return candidate;
		}
	}

	return null;
};

const main = async () => {
	const staticSource = await firstExistingPath(sourceStaticDirs);
	const functionsSource = await firstExistingPath(sourceFunctionsDirs);
	const workerSource = await firstExistingPath(sourceWorkerFiles);

	if (!staticSource) {
		throw new Error(
			"Cloudflare Pages output not found. Expected OpenNext or Next static output (e.g. .open-next/assets, .output/static, .next/static)."
		);
	}

	await ensureEmptyDir(distDir);
	await copyDir(staticSource, distDir);

	await ensureEmptyDir(functionsDir);
	if (functionsSource) {
		await copyDir(functionsSource, functionsDir);
	}

	if (workerSource) {
		await fs.copyFile(workerSource, path.join(functionsDir, "_worker.js"));
	}
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
