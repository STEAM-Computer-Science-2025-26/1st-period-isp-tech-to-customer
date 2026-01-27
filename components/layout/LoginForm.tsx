"use client";

import type { Email, Password } from "@/app/types/types";
import { useEffect, useRef, useState } from "react";
import { FormButton, FormInput, type PanelProps } from "./loginForm/controls";
import { useStackedPanels } from "./loginForm/stackedPanels";
import {
	validateEmail,
	validatePassword,
	validatePasswordConfirmation
} from "./loginForm/validation";

export default function LoginForm({
	registering = false,
	email
}: {
	registering?: boolean;
	email?: Email;
}) {
	const panelA11yProps = (inactive: boolean): PanelProps =>
		inactive ? { "aria-hidden": true, inert: true } : { "aria-hidden": false };

	const [isRegister, setIsRegister] = useState<boolean>(registering);
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
	const [verificationId, setVerificationId] = useState<string>("");
	const [devMagicLink, setDevMagicLink] = useState<string>("");
	const [isSendingVerification, setIsSendingVerification] = useState(false);
	const verificationTimeoutRef = useRef<number | null>(null);
	const verificationPollRef = useRef<number | null>(null);

	const activePanelIndex = stage - 1;
	const { panelsRef, containerHeight, translateY } = useStackedPanels(
		activePanelIndex,
		isRegister
	);

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
		setVerificationId("");
		setDevMagicLink("");
		setStage(2);
	};

	useEffect(() => {
		return () => {
			if (verificationTimeoutRef.current !== null) {
				window.clearTimeout(verificationTimeoutRef.current);
				verificationTimeoutRef.current = null;
			}
			if (verificationPollRef.current !== null) {
				window.clearInterval(verificationPollRef.current);
				verificationPollRef.current = null;
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

	useEffect(() => {
		if (stage !== 2) return;
		if (!verificationId) return;

		if (verificationPollRef.current !== null) {
			window.clearInterval(verificationPollRef.current);
			verificationPollRef.current = null;
		}

		const pollOnce = async () => {
			try {
				const response = await fetch("/api/verify/status", {
					method: "POST",
					credentials: "include",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify({ verificationId })
				});

				if (response.ok) {
					const payload = (await response.json()) as {
						verified: boolean;
						useCode: boolean;
						expiresAt: string;
					};
					if (payload.verified) {
						setStage(3);
						if (verificationPollRef.current !== null) {
							window.clearInterval(verificationPollRef.current);
							verificationPollRef.current = null;
						}
					}
					return;
				}

				if (response.status === 410) {
					setVerificationSendError(
						"Verification expired. Please go back and send a new email."
					);
					if (verificationPollRef.current !== null) {
						window.clearInterval(verificationPollRef.current);
						verificationPollRef.current = null;
					}
				}
			} catch {
				// Ignore transient network errors while polling.
			}
		};

		void pollOnce();
		verificationPollRef.current = window.setInterval(() => {
			void pollOnce();
		}, 2000);

		return () => {
			if (verificationPollRef.current !== null) {
				window.clearInterval(verificationPollRef.current);
				verificationPollRef.current = null;
			}
		};
	}, [stage, verificationId]);

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
		setVerificationCodeError(undefined);
		setIsSendingVerification(true);
		try {
			const response = await fetch("/api/verify/send", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					email: emailCheck.value,
					mode: verificationMode
				})
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
				verificationId?: string;
				expiresAt: string;
				magicLink?: string;
			};

			if (!payload.verificationId) {
				setVerificationSendError(
					"Server did not return a verification id. Please try again."
				);
				return;
			}

			setVerificationId(payload.verificationId);
			setDevMagicLink(payload.magicLink ?? "");

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
		const devLink = devMagicLink ? (
			<p className="mt-2 text-center text-text-tertiary text-sm">
				Dev:{" "}
				<a className="underline" href={devMagicLink}>
					Open verification link
				</a>
			</p>
		) : null;

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
						<>
							<p className="text-center text-text-secondary">
								We&apos;ve sent a magic link to <strong>{emailValue}</strong>.
								Check your inbox and click the link to verify your email.
							</p>
							{devLink}
						</>
					);
				case 2:
					return (
						<p className="text-center text-text-secondary">
							Didn&apos;t get it? You can resend the magic link now.
						</p>
					);
				case 3:
					return (
						<>
							<p className="text-center text-text-secondary">
								We&apos;ve sent another magic link to{" "}
								<strong>{emailValue}</strong>. Check your inbox and click the
								link to verify your email.
							</p>
							{devLink}
						</>
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
						<>
							<p className="text-center text-text-secondary">
								We&apos;ve re-sent the magic link to{" "}
								<strong>{emailValue}</strong>
								{". "}If it still doesn&apos;t arrive, check spam/junk and try
								again later.
							</p>
							{devLink}
						</>
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

		if (!verificationId) {
			setVerificationMode("code");
			await sendVerificationLink();
			return;
		}

		const response = await fetch("/api/verify/request-code", {
			method: "POST",
			credentials: "include",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ verificationId })
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
			if (!verificationId) {
				setVerificationCodeError(
					"Missing verification. Please send a link first."
				);
				return;
			}
			if (!verificationCodeValue.trim()) {
				setVerificationCodeError("Enter the 6-digit code.");
				return;
			}
			const response = await fetch("/api/verify/code", {
				method: "POST",
				credentials: "include",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					verificationId,
					code: verificationCodeValue.trim()
				})
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

	const switchToLogin = () => {
		setIsRegister(false);
		setStage(1);
	};

	const switchToRegister = () => {
		setIsRegister(true);
		setStage(1);
	};

	return (
		<div
			className="w-lg bg-background-primary rounded-2xl shadow-lg backdrop-blur-md overflow-hidden relative"
			style={{
				height: isRegister && containerHeight > 0 ? containerHeight : undefined,
				transition: "height 300ms ease"
			}}
		>
			{isRegister ? (
				<form
					className="w-full pb-10"
					onSubmit={(event) => {
						event.preventDefault();
						if (stage === 1) {
							nextFromEmailStage();
							return;
						}
						if (stage === 2) {
							if (verificationMode === "code") {
								verifyCode();
								return;
							}
							void sendVerificationLink();
							return;
						}
						submitRegister();
					}}
				>
					<div
						className="flex flex-col"
						style={{
							transform: `translateY(${translateY}px)`,
							transition: "transform 300ms ease"
						}}
					>
						<div
							{...panelA11yProps(activePanelIndex !== 0)}
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
							<FormButton text="Next" type="submit" />
							<p className="mt-4 text-sm text-center text-text-secondary">
								Already have an account?{" "}
								<button
									type="button"
									className="cursor-pointer text-accent-main transition-colors duration-100 hover:text-info-text"
									onClick={switchToLogin}
								>
									Login
								</button>
							</p>
						</div>

						<div
							{...panelA11yProps(activePanelIndex !== 1)}
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
										type="submit"
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
										<FormButton text="Verify code" type="submit" />
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
							{...panelA11yProps(activePanelIndex !== 2)}
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
							<FormButton text="Register" type="submit" />
						</div>
					</div>
				</form>
			) : (
				<form
					className="flex flex-col items-center gap-4 px-6 py-12 pb-10"
					onSubmit={(event) => {
						event.preventDefault();
						submitLogin();
					}}
				>
					<h2 className="text-2xl text-accent-text font-semibold">Login</h2>
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
					<FormButton text="Login" type="submit" />
					<p className="mt-2 text-sm text-center text-text-secondary">
						Don&apos;t have an account?{" "}
						<button
							type="button"
							className="cursor-pointer text-accent-main transition-colors duration-100 hover:text-info-text"
							onClick={switchToRegister}
						>
							Register
						</button>
					</p>
				</form>
			)}
		</div>
	);
}
