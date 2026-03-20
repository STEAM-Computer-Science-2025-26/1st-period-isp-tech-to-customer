import {
	createCipheriv,
	createDecipheriv,
	createHash,
	randomBytes
} from "node:crypto";

function sha256Hex(value: string): string {
	return createHash("sha256").update(value, "utf8").digest("hex");
}

export function createMagicToken(): string {
	return randomBytes(32).toString("hex");
}

export function hashMagicToken(token: string): string {
	return sha256Hex(token);
}

export function createVerificationSessionToken(): string {
	// Stored only in an HTTP-only cookie.
	return randomBytes(32).toString("base64url");
}

export function hashVerificationSessionToken(sessionToken: string): string {
	return sha256Hex(sessionToken);
}

function getCodeKey(): Buffer {
	const fromEnv = process.env.VERIFICATION_CODE_KEY;
	if (fromEnv) {
		let decoded: Buffer;
		try {
			decoded = Buffer.from(fromEnv, "base64");
		} catch {
			throw new Error("VERIFICATION_CODE_KEY must be base64-encoded 32 bytes");
		}
		if (decoded.length !== 32) {
			throw new Error("VERIFICATION_CODE_KEY must be base64-encoded 32 bytes");
		}
		return decoded;
	}

	// Dev-only fallback: derive a stable key from DATABASE_URL so local
	// development works without extra config.
	if (process.env.NODE_ENV !== "production") {
		const databaseUrl = process.env.DATABASE_URL;
		if (!databaseUrl) {
			return createHash("sha256").update("dev").digest();
		}
		return createHash("sha256").update(databaseUrl, "utf8").digest();
	}

	throw new Error(
		"Missing VERIFICATION_CODE_KEY. Set it to a base64-encoded 32-byte key."
	);
}

export function encryptVerificationCode(code: string): string {
	const key = getCodeKey();
	const nonce = randomBytes(12);
	const cipher = createCipheriv("aes-256-gcm", key, nonce);
	const ciphertext = Buffer.concat([
		cipher.update(code, "utf8"),
		cipher.final()
	]);
	const tag = cipher.getAuthTag();

	// Format: nonce(12) || tag(16) || ciphertext(N)
	return Buffer.concat([nonce, tag, ciphertext]).toString("base64url");
}

export function decryptVerificationCode(payload: string): string {
	const key = getCodeKey();
	const raw = Buffer.from(payload, "base64url");
	if (raw.length < 12 + 16 + 1) {
		throw new Error("Invalid encrypted code payload");
	}

	const nonce = raw.subarray(0, 12);
	const tag = raw.subarray(12, 28);
	const ciphertext = raw.subarray(28);

	const decipher = createDecipheriv("aes-256-gcm", key, nonce);
	decipher.setAuthTag(tag);
	const plaintext = Buffer.concat([
		decipher.update(ciphertext),
		decipher.final()
	]);

	return plaintext.toString("utf8");
}
