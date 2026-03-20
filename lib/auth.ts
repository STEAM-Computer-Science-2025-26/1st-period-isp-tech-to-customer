const TOKEN_KEY = "authToken";

export function getToken(): string | null {
	if (typeof window === "undefined") return null;
	return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
	localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
	localStorage.removeItem(TOKEN_KEY);
}

export function authHeaders(): HeadersInit {
	const token = getToken();
	return token
		? { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }
		: { "Content-Type": "application/json" };
}
