import { promises as fs } from "node:fs";
import path from "node:path";

const rootDir = process.cwd();
const sourceStaticDir = path.join(rootDir, ".vercel", "output", "static");
const sourceFunctionsDir = path.join(rootDir, ".vercel", "output", "functions");
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

const main = async () => {
	const hasStatic = await pathExists(sourceStaticDir);
	const hasFunctions = await pathExists(sourceFunctionsDir);

	if (!hasStatic) {
		throw new Error(
			"Cloudflare Pages output not found. Expected .vercel/output/static from next-on-pages."
		);
	}

	await ensureEmptyDir(distDir);
	await copyDir(sourceStaticDir, distDir);

	await ensureEmptyDir(functionsDir);
	if (hasFunctions) {
		await copyDir(sourceFunctionsDir, functionsDir);
	}
};

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
