// /services/publicErrors.ts
export const PUBLIC_ERROR_MAP = {
	VALIDATION_ERROR: {
		message: "The information you provided is invalid.",
		action: "Please check your input and try again."
	},
	AUTH_ERROR: {
		message: "You need to be signed in to do that.",
		action: "Please sign in and try again."
	},
	FORBIDDEN: {
		message: "You don't have permission to do that.",
		action: "Contact support if you think this is a mistake."
	},
	NOT_FOUND: {
		message: "We couldn't find what you're looking for.",
		action: "Check the URL and try again."
	},
	RATE_LIMIT: {
		message: "You're making too many requests.",
		action: "Please wait a moment and try again."
	},
	INTERNAL_ERROR: {
		message: "Something went wrong on our end.",
		action: "Please try again in a moment."
	}
};
export function getPublicError(code) {
	const error = PUBLIC_ERROR_MAP[code];
	return error ?? PUBLIC_ERROR_MAP.INTERNAL_ERROR;
}
