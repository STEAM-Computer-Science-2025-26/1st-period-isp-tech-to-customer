import type {
	Email,
	EmailRequirements,
	Password,
	PasswordRequirements
} from "@/app/types/types";

type ValidationOk<T> = { ok: true; value: T };
type ValidationErr = { ok: false; message: string };
export type ValidationResult<T> = ValidationOk<T> | ValidationErr;

const DEFAULT_EMAIL_REQUIREMENTS: EmailRequirements = {
	pattern: "^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$",
	maxLength: 254,
	requireTld: true
};

const DEFAULT_PASSWORD_REQUIREMENTS: PasswordRequirements = {
	minLength: 8,
	maxLength: 128,
	requireLowercase: true,
	requireUppercase: true,
	requireNumber: true,
	requireSpecial: false
};

export function validateEmail(
	raw: string,
	requirements: EmailRequirements = DEFAULT_EMAIL_REQUIREMENTS
): ValidationResult<Email> {
	const value = raw.trim();
	if (!value) return { ok: false, message: "Email is required." };
	if (requirements.maxLength && value.length > requirements.maxLength) {
		return { ok: false, message: "Email is too long." };
	}

	const regex = new RegExp(requirements.pattern);
	if (!regex.test(value)) {
		return { ok: false, message: "Enter a valid email address." };
	}

	if (requirements.requireTld && !value.split(".").pop()) {
		return { ok: false, message: "Email must include a domain." };
	}

	return { ok: true, value: value as Email };
}

export function validatePassword(
	raw: string,
	requirements: PasswordRequirements = DEFAULT_PASSWORD_REQUIREMENTS
): ValidationResult<Password> {
	const value = raw;
	if (!value) return { ok: false, message: "Password is required." };
	if (value.length < requirements.minLength) {
		return {
			ok: false,
			message: `Password must be at least ${requirements.minLength} characters.`
		};
	}
	if (requirements.maxLength && value.length > requirements.maxLength) {
		return { ok: false, message: "Password is too long." };
	}
	if (requirements.requireLowercase && !/[a-z]/.test(value)) {
		return { ok: false, message: "Add at least one lowercase letter." };
	}
	if (requirements.requireUppercase && !/[A-Z]/.test(value)) {
		return { ok: false, message: "Add at least one uppercase letter." };
	}
	if (requirements.requireNumber && !/[0-9]/.test(value)) {
		return { ok: false, message: "Add at least one number." };
	}
	if (requirements.requireSpecial) {
		const allowed = requirements.specialChars
			? requirements.specialChars.replace(/[.*+?^${}()|[\\]\\]/g, "\\$&")
			: "[^A-Za-z0-9]";
		const specialRegex = requirements.specialChars
			? new RegExp(`[${allowed}]`)
			: new RegExp(allowed);
		if (!specialRegex.test(value)) {
			return { ok: false, message: "Add at least one special character." };
		}
	}
	if (requirements.pattern && !new RegExp(requirements.pattern).test(value)) {
		return { ok: false, message: "Password does not meet requirements." };
	}

	return { ok: true, value: value as Password };
}

export function validatePasswordConfirmation(
	password: string,
	confirmPassword: string
): ValidationResult<true> {
	if (!confirmPassword) return { ok: false, message: "Confirm your password." };
	if (password !== confirmPassword) {
		return { ok: false, message: "Passwords do not match." };
	}
	return { ok: true, value: true };
}
