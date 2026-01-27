"use client";

import type {
	Email,
	EmailRequirements,
	Password,
	PasswordRequirements
} from "@/app/types/types";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import clsx from "clsx";
import { Eye, EyeOff, Loader2 } from "lucide-react";

function FormButton({
	text,
	onClick,
	disabled,
	isLoading
}: {
	text: string;
	onClick?: () => void;
	disabled?: boolean;
	isLoading?: boolean;
}) {
	const isDisabled = Boolean(disabled || isLoading);

	return (
		<button
			type="button"
			onClick={onClick}
			disabled={isDisabled}
			aria-busy={isLoading ? true : undefined}
			className={clsx(
				"h-10 w-full max-w-84 rounded-lg bg-accent-main text-background-primary font-semibold transition-opacity flex items-center justify-center",
				isDisabled && "opacity-60 cursor-not-allowed"
			)}
		>
			{isLoading ? (
				<>
					<Loader2 className="animate-spin" size={18} />
					<span className="sr-only">{text}</span>
				</>
			) : (
				text
			)}
		</button>
	);
}

type FormInputType = "text" | "email" | "password" | "verification-code";

type FormInputBaseProps = {
	label: string;
	value: string;
	onChange: (value: string) => void;
	isInvalid?: boolean;
	error?: string;
	readOnly?: boolean;
};

type VerificationCodeInputProps = FormInputBaseProps & {
	type: "verification-code";
};

type StandardFormInputProps = FormInputBaseProps & {
	type: "text" | "email" | "password";
	passwordShown?: boolean;
};

function VerificationCodeInput({
	label,
	value,
	onChange,
	isInvalid,
	error,
	readOnly
}: VerificationCodeInputProps) {
	const length = 6;
	const inputsRef = useRef<Array<HTMLInputElement | null>>([]);
	const digits = useMemo(() => {
		const onlyDigits = value.replace(/\D/g, "").slice(0, length);
		return Array.from({ length }, (_, i) => onlyDigits[i] ?? "");
	}, [value]);

	const focusIndex = (index: number) => {
		const el = inputsRef.current[index];
		el?.focus();
		el?.select();
	};

	const setDigitAt = (index: number, nextDigit: string) => {
		const nextDigits = [...digits];
		nextDigits[index] = nextDigit;
		onChange(nextDigits.join(""));
	};

	const applyPaste = (startIndex: number, pasted: string) => {
		const incoming = pasted.replace(/\D/g, "").slice(0, length);
		if (!incoming) return;
		const nextDigits = [...digits];
		let writeIndex = startIndex;
		for (const ch of incoming) {
			if (writeIndex >= length) break;
			nextDigits[writeIndex] = ch;
			writeIndex += 1;
		}
		onChange(nextDigits.join(""));
		focusIndex(Math.min(writeIndex, length - 1));
	};

	return (
		<div
			className={clsx(
				"relative w-full max-w-84 ease duration-200",
				isInvalid && "mb-4"
			)}
		>
			<label
				className={clsx(
					"block text-sm mb-2",
					isInvalid ? "text-destructive-text" : "text-accent-text"
				)}
			>
				{label}
			</label>
			<div className="flex w-full justify-between gap-2">
				{digits.map((digit, index) => (
					<input
						key={index}
						ref={(el) => {
							inputsRef.current[index] = el;
						}}
						className={clsx(
							"transition-colors duration-200 border-2 rounded-lg text-accent-text/80 w-10 h-10 outline-none bg-transparent text-center text-lg",
							!readOnly && "focus:text-text-secondary",
							isInvalid
								? "border-destructive-foreground text-destructive-text/70"
								: "border-accent-text/70"
						)}
						type="text"
						inputMode="numeric"
						pattern="[0-9]*"
						autoComplete={index === 0 ? "one-time-code" : "off"}
						maxLength={1}
						value={digit}
						readOnly={readOnly}
						aria-label={`${label} digit ${index + 1} of ${length}`}
						aria-invalid={isInvalid ? true : undefined}
						onFocus={(e) => e.currentTarget.select()}
						onPaste={(e) => {
							if (readOnly) return;
							e.preventDefault();
							applyPaste(index, e.clipboardData.getData("text"));
						}}
						onChange={(e) => {
							if (readOnly) return;
							const nextRaw = e.target.value;
							if (!nextRaw) {
								setDigitAt(index, "");
								return;
							}

							const last = nextRaw.slice(-1);
							if (!/\d/.test(last)) return;
							setDigitAt(index, last);
							if (index < length - 1) focusIndex(index + 1);
						}}
						onKeyDown={(e) => {
							if (readOnly) return;
							if (e.key === "ArrowLeft") {
								e.preventDefault();
								focusIndex(Math.max(0, index - 1));
								return;
							}
							if (e.key === "ArrowRight") {
								e.preventDefault();
								focusIndex(Math.min(length - 1, index + 1));
								return;
							}
							if (e.key === "Backspace") {
								e.preventDefault();
								if (digits[index]) {
									setDigitAt(index, "");
									return;
								}
								if (index > 0) {
									setDigitAt(index - 1, "");
									focusIndex(index - 1);
								}
								return;
							}
							if (e.key === "Delete") {
								e.preventDefault();
								setDigitAt(index, "");
								return;
							}
						}}
					/>
				))}
			</div>
			{isInvalid && error ? (
				<p className="absolute -bottom-4 text-xs text-destructive-text max-w-84">
					{error}
				</p>
			) : null}
		</div>
	);
}

function StandardFormInput({
	label,
	type,
	value,
	onChange,
	isInvalid,
	error,
	readOnly,
	passwordShown = false
}: StandardFormInputProps) {
	const inputRef = useRef<HTMLInputElement | null>(null);
	const selectionRef = useRef<{
		start: number | null;
		end: number | null;
		wasFocused: boolean;
	} | null>(null);

	const [shown, setShown] = useState(passwordShown);
	const effectiveType: "text" | "email" | "password" =
		type === "password" && shown ? "text" : type;

	useEffect(() => {
		if (type !== "password") return;
		const selection = selectionRef.current;
		if (!selection?.wasFocused) return;
		const input = inputRef.current;
		if (!input) return;

		requestAnimationFrame(() => {
			input.focus();
			if (selection.start !== null && selection.end !== null) {
				try {
					input.setSelectionRange(selection.start, selection.end);
				} catch {
					// Safe to ignore.
				}
			}
		});
	}, [shown, type]);

	return (
		<div
			className={clsx(
				"relative w-full max-w-84 ease duration-200",
				isInvalid && "mb-4"
			)}
		>
			<input
				ref={inputRef}
				className={clsx(
					"peer transition-colors duration-200 border-2 rounded-lg text-accent-text/80 w-full h-10 outline-none px-3 bg-transparent",
					!readOnly && "focus:text-text-secondary",
					isInvalid
						? "border-destructive-foreground text-destructive-text/70"
						: "border-accent-text/70",
					type === "password" && !shown && "tracking-[0.175rem]"
				)}
				type={effectiveType}
				value={value}
				onChange={(e) => onChange(e.target.value)}
				placeholder=" "
				aria-label={label}
				aria-invalid={isInvalid ? true : undefined}
				readOnly={readOnly}
			/>
			{type === "password" ? (
				<button
					type="button"
					className="absolute bg-background-primary right-2 text-text-tertiary w-5 h-8 bottom-1/2 translate-y-1/2"
					aria-label={shown ? "Hide password" : "Show password"}
					onMouseDown={(e) => {
						// Prevents stealing focus from the input.
						e.preventDefault();
					}}
					onClick={(e) => {
						e.preventDefault();
						const input = inputRef.current;
						selectionRef.current = {
							start: input?.selectionStart ?? null,
							end: input?.selectionEnd ?? null,
							wasFocused: document.activeElement === input
						};
						setShown((prev) => !prev);
					}}
				>
					{shown ? <EyeOff size={20} /> : <Eye size={20} />}
				</button>
			) : null}
			<label
				className={clsx(
					"absolute left-2 top-0 px-1 ease duration-200 -translate-y-1/2 text-sm pointer-events-none bg-background-primary",
					isInvalid ? "text-destructive-text" : "text-accent-text",
					"peer-placeholder-shown:left-[calc((3*var(--spacing))+2px)] peer-placeholder-shown:top-1/2 peer-placeholder-shown:text-base peer-placeholder-shown:px-0",
					isInvalid
						? "peer-placeholder-shown:text-destructive-text/70"
						: "peer-placeholder-shown:text-text-tertiary"
				)}
			>
				{label}
			</label>
			{isInvalid && error ? (
				<p className="absolute -bottom-4 text-xs text-destructive-text max-w-84">
					{error}
				</p>
			) : null}
		</div>
	);
}

function FormInput(
	props: (StandardFormInputProps | VerificationCodeInputProps) & {
		type: FormInputType;
	}
) {
	if (props.type === "verification-code") {
		return <VerificationCodeInput {...(props as VerificationCodeInputProps)} />;
	}
	return <StandardFormInput {...(props as StandardFormInputProps)} />;
}

function useStackedPanels(activeIndex: number) {
	const panelsRef = useRef<Array<HTMLDivElement | null>>([]);
	const [panelHeights, setPanelHeights] = useState<number[]>([]);

	useLayoutEffect(() => {
		const elements = panelsRef.current.filter(
			(el): el is HTMLDivElement => el !== null
		);
		if (elements.length === 0) return;

		const update = () => {
			setPanelHeights(
				panelsRef.current.map((el) => el?.getBoundingClientRect().height ?? 0)
			);
		};

		update();
		const ro = new ResizeObserver(update);
		elements.forEach((el) => ro.observe(el));
		return () => ro.disconnect();
	}, []);

	const panelOffsets = useMemo(() => {
		const offsets: number[] = [];
		let acc = 0;
		for (let i = 0; i < panelHeights.length; i += 1) {
			offsets.push(acc);
			acc += panelHeights[i] ?? 0;
		}
		return offsets;
	}, [panelHeights]);

	const containerHeight = panelHeights[activeIndex] ?? 0;
	const translateY = -(panelOffsets[activeIndex] ?? 0);

	return { panelsRef, containerHeight, translateY };
}

export default function LoginForm({
	isRegister = false,
	email
}: {
	isRegister?: boolean;
	email?: Email;
}) {
	const [stage, setStage] = useState<1 | 2 | 3>(1);
	const [verificationMode, setVerificationMode] = useState<"link" | "code">(
		"link"
	);
	const [emailValue, setEmailValue] = useState<string>(email ?? "");
	const [passwordValue, setPasswordValue] = useState<string>("");
	const [confirmPasswordValue, setConfirmPasswordValue] = useState<string>("");
	const [verificationCodeValue, setVerificationCodeValue] =
		useState<string>("");
	const [emailError, setEmailError] = useState<string | undefined>(undefined);
	const [passwordError, setPasswordError] = useState<string | undefined>(
		undefined
	);
	const [confirmPasswordError, setConfirmPasswordError] = useState<
		string | undefined
	>(undefined);
	const [verificationSendStep, setVerificationSendStep] = useState<
		0 | 1 | 2 | 3 | 4 | 5
	>(0);
	const [verificationSendError, setVerificationSendError] = useState<
		string | undefined
	>(undefined);
	const [verificationRequestCodeError, setVerificationRequestCodeError] =
		useState<string | undefined>(undefined);
	const [verificationCodeError, setVerificationCodeError] = useState<
		string | undefined
	>(undefined);
	const [verificationToken, setVerificationToken] = useState<string>("");
	const [isSendingVerification, setIsSendingVerification] = useState(false);
	const verificationTimeoutRef = useRef<number | null>(null);

	const activePanelIndex = stage - 1;
	const { panelsRef, containerHeight, translateY } =
		useStackedPanels(activePanelIndex);

	const nextFromEmailStage = () => {
		const emailCheck = validateEmail(emailValue);
		if (!emailCheck.ok) {
			setEmailError(emailCheck.message);
			return;
		}
		setEmailError(undefined);
		setVerificationSendError(undefined);
		setVerificationRequestCodeError(undefined);
		setVerificationCodeError(undefined);
		setVerificationCodeValue("");
		setVerificationMode("link");
		setVerificationSendStep(0);
		setVerificationToken("");
		setStage(2);
	};

	useEffect(() => {
		return () => {
			if (verificationTimeoutRef.current !== null) {
				window.clearTimeout(verificationTimeoutRef.current);
				verificationTimeoutRef.current = null;
			}
		};
	}, []);

	const scheduleVerificationCooldown = (nextStep: 2 | 4, delayMs: number) => {
		if (verificationTimeoutRef.current !== null) {
			window.clearTimeout(verificationTimeoutRef.current);
			verificationTimeoutRef.current = null;
		}
		verificationTimeoutRef.current = window.setTimeout(() => {
			setVerificationSendStep(nextStep);
			verificationTimeoutRef.current = null;
		}, delayMs);
	};

	const getToken = () => {
		if (typeof window === "undefined") return verificationToken;
		const tokenFromUrl = new URLSearchParams(window.location.search).get(
			"token"
		);
		return tokenFromUrl ?? verificationToken;
	};

	const sendVerificationLink = async () => {
		if (isSendingVerification) return;
		if (
			verificationSendStep === 1 ||
			verificationSendStep === 3 ||
			verificationSendStep === 5
		) {
			return;
		}

		const emailCheck = validateEmail(emailValue);
		if (!emailCheck.ok) {
			setEmailError(emailCheck.message);
			return;
		}

		setVerificationSendError(undefined);
		setVerificationRequestCodeError(undefined);
		setIsSendingVerification(true);
		try {
			const response = await fetch("/api/verify/send", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ email: emailCheck.value })
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				setVerificationSendError(
					payload?.message ?? "Failed to send verification email."
				);
				return;
			}

			const payload = (await response.json()) as {
				token: string;
				expiresAt: string;
			};

			setVerificationToken(payload.token);
			if (typeof window !== "undefined") {
				// Requested behavior: put the token in the URL without a reload.
				window.history.replaceState({}, "", `/verify?token=${payload.token}`);
			}

			if (verificationSendStep === 0) {
				setVerificationSendStep(1);
				scheduleVerificationCooldown(2, 120_000);
				return;
			}
			if (verificationSendStep === 2) {
				setVerificationSendStep(3);
				scheduleVerificationCooldown(4, 300_000);
				return;
			}
			if (verificationSendStep === 4) {
				setVerificationSendStep(5);
				return;
			}
		} finally {
			setIsSendingVerification(false);
		}
	};

	const verificationSendLabel =
		verificationSendStep === 0
			? "Send email"
			: verificationSendStep === 1
				? "Sent"
				: verificationSendStep === 2
					? "Resend"
					: verificationSendStep === 3
						? "Sent"
						: verificationSendStep === 4
							? "Final resend"
							: "Re-sent";

	const verificationSendDisabled =
		verificationSendStep === 1 ||
		verificationSendStep === 3 ||
		verificationSendStep === 5;

	const renderVerificationParagraph = () => {
		if (verificationMode === "link") {
			switch (verificationSendStep) {
				case 0:
					return (
						<p className="text-center text-text-secondary">
							We&apos;re going to send a magic link to{" "}
							<strong>{emailValue}</strong>. Click send when you&apos;re ready.
						</p>
					);
				case 1:
					return (
						<p className="text-center text-text-secondary">
							We&apos;ve sent a magic link to <strong>{emailValue}</strong>.
							Check your inbox and click the link to verify your email.
						</p>
					);
				case 2:
					return (
						<p className="text-center text-text-secondary">
							Didn&apos;t get it? You can resend the magic link now.
						</p>
					);
				case 3:
					return (
						<p className="text-center text-text-secondary">
							We&apos;ve sent another magic link to{" "}
							<strong>{emailValue}</strong>. Check your inbox and click the link
							to verify your email.
						</p>
					);
				case 4:
					return (
						<p className="text-center text-text-secondary">
							Still nothing? You can send one final resend.
						</p>
					);
				case 5:
				default:
					return (
						<p className="text-center text-text-secondary">
							We&apos;ve re-sent the magic link to <strong>{emailValue}</strong>
							{". "}If it still doesn&apos;t arrive, check spam/junk and try
							again later.
						</p>
					);
			}
		}

		switch (verificationSendStep) {
			case 0:
				return (
					<p className="text-center text-text-secondary">
						We&apos;re going to send a link to <strong>{emailValue}</strong>{" "}
						that shows a verification code on your other device. Click send when
						you&apos;re ready.
					</p>
				);
			case 1:
				return (
					<p className="text-center text-text-secondary">
						We&apos;ve sent a link to <strong>{emailValue}</strong>. Open it on
						your other device to view the verification code, then enter it here.
					</p>
				);
			case 2:
				return (
					<p className="text-center text-text-secondary">
						Didn&apos;t get it? You can resend the link now.
					</p>
				);
			case 3:
				return (
					<p className="text-center text-text-secondary">
						We&apos;ve sent another link to <strong>{emailValue}</strong>. Open
						it on your other device to view the verification code, then enter it
						here.
					</p>
				);
			case 4:
				return (
					<p className="text-center text-text-secondary">
						Still nothing? You can send one final resend.
					</p>
				);
			case 5:
			default:
				return (
					<p className="text-center text-text-secondary">
						We&apos;ve re-sent the link to <strong>{emailValue}</strong>. If it
						still doesn&apos;t arrive, check spam/junk and try again later.
					</p>
				);
		}
	};

	const switchToCodeMode = async () => {
		setVerificationRequestCodeError(undefined);
		setVerificationCodeError(undefined);
		const token = getToken();
		if (!token) {
			setVerificationRequestCodeError(
				"Send the link first, then switch to code."
			);
			return;
		}

		const response = await fetch("/api/verify/request-code", {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ token })
		});

		if (!response.ok) {
			const payload = (await response.json().catch(() => null)) as {
				message?: string;
			} | null;
			setVerificationRequestCodeError(
				payload?.message ?? "Could not request a verification code."
			);
			return;
		}

		setVerificationMode("code");
	};

	const verifyCode = () => {
		void (async () => {
			setVerificationCodeError(undefined);
			const token = getToken();
			if (!token) {
				setVerificationCodeError("Missing token. Please send a link first.");
				return;
			}
			if (!verificationCodeValue.trim()) {
				setVerificationCodeError("Enter the 6-digit code.");
				return;
			}
			const response = await fetch("/api/verify/code", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ token, code: verificationCodeValue.trim() })
			});

			if (!response.ok) {
				const payload = (await response.json().catch(() => null)) as {
					message?: string;
				} | null;
				setVerificationCodeError(payload?.message ?? "Verification failed.");
				return;
			}

			setStage(3);
		})();
	};

	const submitRegister = () => {
		const emailCheck = validateEmail(emailValue);
		const passwordCheck = validatePassword(passwordValue);
		const confirmCheck = validatePasswordConfirmation(
			passwordValue,
			confirmPasswordValue
		);

		setEmailError(emailCheck.ok ? undefined : emailCheck.message);
		setPasswordError(passwordCheck.ok ? undefined : passwordCheck.message);
		setConfirmPasswordError(confirmCheck.ok ? undefined : confirmCheck.message);

		if (!emailCheck.ok || !passwordCheck.ok || !confirmCheck.ok) return;

		const typedEmail: Email = emailCheck.value;
		const typedPassword: Password = passwordCheck.value;
		void typedEmail;
		void typedPassword;
	};

	const submitLogin = () => {
		const emailCheck = validateEmail(emailValue);
		const passwordCheck = validatePassword(passwordValue);

		setEmailError(emailCheck.ok ? undefined : emailCheck.message);
		setPasswordError(passwordCheck.ok ? undefined : passwordCheck.message);

		if (!emailCheck.ok || !passwordCheck.ok) return;

		const typedEmail: Email = emailCheck.value;
		const typedPassword: Password = passwordCheck.value;
		void typedEmail;
		void typedPassword;
	};

	return (
		<div
			className="w-lg bg-background-primary rounded-2xl shadow-lg backdrop-blur-md overflow-hidden"
			style={{
				height: containerHeight > 0 ? containerHeight : undefined,
				transition: "height 300ms ease"
			}}
		>
			{isRegister ? (
				<form className="w-full">
					<div
						className="flex flex-col"
						style={{
							transform: `translateY(${translateY}px)`,
							transition: "transform 300ms ease"
						}}
					>
						<div
							ref={(el) => {
								panelsRef.current[0] = el;
							}}
							className="flex flex-col gap-4 w-full items-center px-6 py-12"
						>
							<h2 className="text-2xl font-semibold text-accent-text">
								Create an Account
							</h2>
							<FormInput
								label="Email"
								type="email"
								value={emailValue}
								onChange={(v) => {
									setEmailValue(v);
									if (emailError) setEmailError(undefined);
								}}
								isInvalid={Boolean(emailError)}
								error={emailError}
							/>
							<FormButton text="Next" onClick={nextFromEmailStage} />
						</div>

						<div
							ref={(el) => {
								panelsRef.current[1] = el;
							}}
							className="flex flex-col gap-4 w-full items-center px-6 py-12"
						>
							<h2 className="text-2xl font-semibold text-accent-text">
								Verify Your Email
							</h2>
							{verificationMode === "link" ? (
								<>
									{renderVerificationParagraph()}
									<FormButton
										text={verificationSendLabel}
										disabled={verificationSendDisabled}
										isLoading={isSendingVerification}
										onClick={sendVerificationLink}
									/>
									{verificationSendError ? (
										<p className="text-center text-destructive-text text-sm">
											{verificationSendError}
										</p>
									) : null}
									<p className="text-center text-text-secondary text-sm">
										Using another device?{" "}
										<button
											type="button"
											onClick={() => void switchToCodeMode()}
											className="text-accent-text transition-colors duration-200 hover:text-info-text"
										>
											Use a verification code instead
										</button>
									</p>
									{verificationRequestCodeError ? (
										<p className="text-center text-destructive-text text-sm">
											{verificationRequestCodeError}
										</p>
									) : null}
								</>
							) : (
								<>
									{renderVerificationParagraph()}
									<FormButton
										text={verificationSendLabel}
										disabled={verificationSendDisabled}
										isLoading={isSendingVerification}
										onClick={sendVerificationLink}
									/>
									{verificationSendError ? (
										<p className="text-center text-destructive-text text-sm">
											{verificationSendError}
										</p>
									) : null}
									<FormInput
										label="Verification Code"
										type="verification-code"
										value={verificationCodeValue}
										onChange={(v) => setVerificationCodeValue(v)}
										isInvalid={Boolean(verificationCodeError)}
										error={verificationCodeError}
									/>
									<div className="w-full max-w-84 flex flex-col gap-2">
										<FormButton text="Verify code" onClick={verifyCode} />
										<button
											type="button"
											onClick={() => setVerificationMode("link")}
											className="h-10 w-full rounded-lg border border-accent-text/40 text-accent-text font-semibold transition-colors duration-200 hover:bg-accent-text/10"
										>
											Use a magic link
										</button>
									</div>
								</>
							)}
						</div>

						<div
							ref={(el) => {
								panelsRef.current[2] = el;
							}}
							className="flex flex-col gap-4 w-full items-center px-6 py-12"
						>
							<h2 className="text-2xl font-semibold text-accent-text">
								Set a Password
							</h2>
							<FormInput
								label="Email"
								type="email"
								value={emailValue}
								onChange={(v) => {
									setEmailValue(v);
									if (emailError) setEmailError(undefined);
								}}
								readOnly
								isInvalid={Boolean(emailError)}
								error={emailError}
							/>
							<FormInput
								label="Password"
								type="password"
								value={passwordValue}
								onChange={(v) => {
									setPasswordValue(v);
									if (passwordError) setPasswordError(undefined);
								}}
								isInvalid={Boolean(passwordError)}
								error={passwordError}
							/>
							<FormInput
								label="Confirm Password"
								type="password"
								value={confirmPasswordValue}
								onChange={(v) => {
									setConfirmPasswordValue(v);
									if (confirmPasswordError) setConfirmPasswordError(undefined);
								}}
								isInvalid={Boolean(confirmPasswordError)}
								error={confirmPasswordError}
							/>
							<FormButton text="Register" onClick={submitRegister} />
						</div>
					</div>
				</form>
			) : (
				<form className="flex flex-col gap-4 px-6 py-12">
					<h2 className="text-2xl font-semibold text-text-main">Login</h2>
					<FormInput
						label="Email"
						type="email"
						value={emailValue}
						onChange={(v) => {
							setEmailValue(v);
							if (emailError) setEmailError(undefined);
						}}
						isInvalid={Boolean(emailError)}
						error={emailError}
					/>
					<FormInput
						label="Password"
						type="password"
						value={passwordValue}
						onChange={(v) => {
							setPasswordValue(v);
							if (passwordError) setPasswordError(undefined);
						}}
						isInvalid={Boolean(passwordError)}
						error={passwordError}
					/>
					<FormButton text="Login" onClick={submitLogin} />
				</form>
			)}
		</div>
	);
}

type ValidationOk<T> = { ok: true; value: T };
type ValidationErr = { ok: false; message: string };
type ValidationResult<T> = ValidationOk<T> | ValidationErr;

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

function validateEmail(
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

function validatePassword(
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
			? requirements.specialChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
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

function validatePasswordConfirmation(
	password: string,
	confirmPassword: string
): ValidationResult<true> {
	if (!confirmPassword) return { ok: false, message: "Confirm your password." };
	if (password !== confirmPassword) {
		return { ok: false, message: "Passwords do not match." };
	}
	return { ok: true, value: true };
}
