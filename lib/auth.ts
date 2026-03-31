const TOKEN_KEY = "authToken";

export function getToken(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(TOKEN_KEY);
}

type JwtPayload = {
	exp?: number;
};

function decodeJwtPayload(token: string): JwtPayload | null {
	try {
		const rawPayload = token.split(".")[1];
		if (!rawPayload) return null;
		const base64 = rawPayload.replace(/-/g, "+").replace(/_/g, "/");
		const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
		const json = atob(padded);
		return JSON.parse(json) as JwtPayload;
	} catch {
		return null;
	}
}

export function isTokenValid(): boolean {
	const token = getToken();
	if (!token) return false;
	const payload = decodeJwtPayload(token);
	if (!payload) return false;
	if (typeof payload.exp === "number") {
		return payload.exp * 1000 > Date.now();
	}
	return true;
}

export function setToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export function getCompanyId(): string | null {
	const token = getToken();
	if (!token) return null;
	try {
		const payload = JSON.parse(atob(token.split(".")[1]));
		return payload.companyId ?? null;
	} catch {
		return null;
	}
}

export function authHeaders(): HeadersInit {
	const token = getToken();
	return token
		? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
		: { "Content-Type": "application/json" };
}
