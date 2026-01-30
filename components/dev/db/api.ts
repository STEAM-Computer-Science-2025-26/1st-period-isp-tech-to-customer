export async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
	const res = await fetch(url, {
		...init,
		headers: {
			"Content-Type": "application/json",
			...(init?.headers ?? {})
		}
	});

	const text = await res.text();
	let data: any = null;
	try {
		data = text ? JSON.parse(text) : null;
	} catch {
		// non-json response
	}

	if (!res.ok) {
		const message =
			(data && (data.error || data.message)) || text || res.statusText;
		throw new Error(message);
	}

	return data as T;
}
