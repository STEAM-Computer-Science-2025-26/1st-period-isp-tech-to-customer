const DEFAULT_FALLBACK = "--";

function toValidDate(value?: unknown): Date | null {
	if (value == null) return null;
	const date = value instanceof Date ? value : new Date(value as string);
	if (Number.isNaN(date.getTime())) return null;
	return date;
}

export function formatReadableDate(
	value?: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const date = toValidDate(value);
	if (!date) return fallback;
	return date.toLocaleDateString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric"
	});
}

export function formatNumericDate(
	value?: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const date = toValidDate(value);
	if (!date) return fallback;
	return date.toLocaleDateString("en-US", {
		month: "2-digit",
		day: "2-digit",
		year: "numeric"
	});
}

export function formatReadableDateTime(
	value?: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const date = toValidDate(value);
	if (!date) return fallback;
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		year: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

export function formatReadableShortDateTime(
	value?: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const date = toValidDate(value);
	if (!date) return fallback;
	return date.toLocaleString("en-US", {
		month: "short",
		day: "numeric",
		hour: "numeric",
		minute: "2-digit"
	});
}

export function formatRelativeTime(
	value?: unknown,
	fallback = DEFAULT_FALLBACK
): string {
	const date = toValidDate(value);
	if (!date) return fallback;

	const diffMs = Date.now() - date.getTime();
	if (diffMs < 0) return "just now";

	const minutes = Math.floor(diffMs / 60_000);
	if (minutes < 1) return "just now";
	if (minutes < 60) return `${minutes}m ago`;

	const hours = Math.floor(minutes / 60);
	if (hours < 24) return `${hours}h ago`;

	const days = Math.floor(hours / 24);
	if (days < 30) return `${days}d ago`;

	return formatReadableDate(date, fallback);
}
