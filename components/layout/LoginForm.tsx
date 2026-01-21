"use client";

/* 
	This component is the login and registration form used in the app. It is a small form that can be placed anywhere in the site
	in things like modals or dedicated pages.
	It handles user input, form submission, and transitions between login and registration modes.

*/

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';

import type { LoginInput, LoginSuccess } from '@/lib/types/userTypes';

type LoginFormProps = {
	defaultMode?: 'login' | 'register';
};

export function RegisterVerificationDemo({ mode }: { mode: 'link' | 'code' }) {
	const fakeCode = '123456';

	if (mode === 'link') {
		return (
			<div className="w-full flex flex-col items-center">
				<p className="text-center font-medium mb-2">Redirecting to the app…</p>
				<p className="text-sm text-center text-text-secondary">
					If this takes too long, check your email link.
				</p>
			</div>
		);
	}

	return (
		<div className="w-full flex flex-col items-center">
			<p className="text-center font-medium mb-2">Your verification code</p>
			<div className="w-full flex justify-center gap-2">
				{fakeCode.split('').map((digit, idx) => (
					<div
						key={idx}
						className="w-11 h-11 border border-gray-300 rounded-md text-center text-lg flex items-center justify-center"
					>
						{digit}
					</div>
				))}
			</div>
			<p className="text-xs text-center text-text-secondary mt-2">Demo only (fake code).</p>
		</div>
	);
}

const constantTimeEqual = (a: string, b: string) => {
	if (a.length !== b.length) return false;
	let diff = 0;
	for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
	return diff === 0;
};

export default function LoginForm({ defaultMode = 'login' }: LoginFormProps = {}) {
	const router = useRouter();
	const [form, setForm] = useState<LoginInput>({ email: '', password: '' });
	const [error, setError] = useState<string | null>(null);
	const [notice, setNotice] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [showPassword, setShowPassword] = useState(false);
	const [touched, setTouched] = useState<{ email: boolean; password: boolean }>({
		email: false,
		password: false,
	});
	const [mode, setMode] = useState<'login' | 'register'>(defaultMode);
	const [registerStep, setRegisterStep] = useState<1 | 2 | 3>(1);
	const [verificationCode, setVerificationCode] = useState<string[]>(Array(6).fill(''));
	const [showManualCode, setShowManualCode] = useState(false);
	const [verificationError, setVerificationError] = useState<string | null>(null);
	const [isVerifyingCode, setIsVerifyingCode] = useState(false);
	const [codeAttempts, setCodeAttempts] = useState(0);
	const verificationRefs = useRef<Array<HTMLInputElement | null>>([]);
	const registerSliderViewportRef = useRef<HTMLDivElement | null>(null);
	const [registerPanelWidth, setRegisterPanelWidth] = useState<number>(0);
	const registerPanelRefs = useRef<Array<HTMLDivElement | null>>([]);
	const [registerViewportHeight, setRegisterViewportHeight] = useState<number>(0);
	const [registerPassword, setRegisterPassword] = useState('');
	const [registerPasswordConfirm, setRegisterPasswordConfirm] = useState('');
	const [showRegisterPassword, setShowRegisterPassword] = useState(false);
	const [showRegisterPasswordConfirm, setShowRegisterPasswordConfirm] = useState(false);

	const inputClassName =
		'peer transition-colors duration-300 text-text-tertiary focus:text-text-primary w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:border-accent-main';
	const buttonClassName =
		'bg-accent-main border-2 border-accent-main hover:text-accent-text hover:bg-background-secondary/40 cursor-pointer max-w-96 w-full text-white py-2 px-4 rounded-md transition-colors disabled:opacity-60';

	const onSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
		e.preventDefault();
		setError(null);
		setNotice(null);

		if (mode === 'register') {
			if (registerStep === 1) {
				if (!emailIsValid) {
					setTouched((prev) => ({ ...prev, email: true }));
					setError('Please enter a valid email address.');
					return;
				}

				setVerificationError(null);
				setShowManualCode(false);
				setVerificationCode(Array(6).fill(''));
				setCodeAttempts(0);
				setRegisterStep(2);
				return;
			}

			if (registerStep === 2) {
				// No submit button on this screen (verification is automatic).
				return;
			}

			// registerStep === 3
			const password = registerPassword;
			const confirm = registerPasswordConfirm;

			const pwMinLength = password.length >= 8;
			const pwHasLower = /[a-z]/.test(password);
			const pwHasUpper = /[A-Z]/.test(password);
			const pwHasNumber = /\d/.test(password);
			const pwHasSymbol = /[^A-Za-z0-9]/.test(password);
			const pwNoSpaces = !/\s/.test(password);
			const pwAllCriteria =
				pwMinLength && pwHasLower && pwHasUpper && pwHasNumber && pwHasSymbol && pwNoSpaces;

			if (!pwAllCriteria) {
				setError('Please choose a stronger password (meet all criteria).');
				return;
			}
			if (password !== confirm) {
				setError('Passwords do not match.');
				return;
			}

			// Backend not wired yet: this is where you'd POST to your register/finish endpoint.
			setNotice('Password looks good. (Demo) Backend hookup needed to finish creating the account.');
			setRegisterPassword('');
			setRegisterPasswordConfirm('');
			setMode('login');
			setRegisterStep(1);
			setShowManualCode(false);
			setVerificationCode(Array(6).fill(''));
			return;
		}

		if (!emailIsValid) {
			setTouched((prev) => ({ ...prev, email: true }));
			setError('Please enter a valid email address.');
			return;
		}
		if (!passwordIsValid) {
			setTouched((prev) => ({ ...prev, password: true }));
			setError('Please enter a password (at least 8 characters).');
			return;
		}

		setIsSubmitting(true);

		try {
			const res = await fetch('/api/auth/login', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(form),
			});

			if (!res.ok) {
				const body = (await res.json().catch(() => null)) as { message?: string } | null;
				setError(body?.message ?? 'Login failed.');
				return;
			}

			await res.json() as LoginSuccess;
			router.push('/');
		} catch {
			setError('Network error. Please try again.');
		} finally {
			setIsSubmitting(false);
		}
	};

	const isRegister = mode === 'register';

	const emailValue = form.email.trim();
	const emailIsValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailValue);
	const passwordIsValid = form.password.trim().length >= 8;
	const emailHasValue = emailValue.length > 0;
	const passwordHasValue = form.password.trim().length > 0;

	const emailInputClass =
		inputClassName +
		(touched.email && !emailIsValid && emailHasValue
			? ' border-destructive-background focus:border-destructive-background'
			: '');
	const passwordInputClass =
		inputClassName +
		(touched.password && !passwordIsValid && passwordHasValue
			? ' border-destructive-background focus:border-destructive-background'
			: '');

	const labelBaseClass =
		'text-text-secondary absolute top-0 peer-placeholder-shown:top-1/2 -translate-y-1/2 left-2 bg-background-primary px-1 rounded block text-sm font-medium transition-all duration-300';
	const emailLabelClass =
		labelBaseClass +
		(touched.email && !emailIsValid && emailHasValue
			? ' peer-focus:text-destructive-text'
			: ' peer-focus:text-accent-text');
	const passwordLabelClass =
		labelBaseClass +
		(touched.password && !passwordIsValid && passwordHasValue
			? ' peer-focus:text-destructive-text'
			: ' peer-focus:text-accent-text');

	const setVerificationDigit = (index: number, value: string) => {
		const digit = value.replace(/\D/g, '').slice(-1);
		setVerificationCode((prev) => {
			const next = [...prev];
			next[index] = digit;
			return next;
		});
		if (digit && index < 5) {
			verificationRefs.current[index + 1]?.focus();
		}
	};

	const verificationCodeValue = verificationCode.join('');
	const verificationComplete = verificationCode.every((d) => d.length === 1);
	const maxCodeAttempts = 5;

	useEffect(() => {
		if (mode !== 'register') return;
		if (registerStep !== 2) return;
		if (!showManualCode) return;
		if (!verificationComplete) return;
		if (isVerifyingCode) return;
		if (codeAttempts >= maxCodeAttempts) return;

		let cancelled = false;
		setIsVerifyingCode(true);
		setVerificationError(null);

		const run = async () => {
			await new Promise((r) => setTimeout(r, 450));

			// Demo-only: accept 123456.
			const ok = constantTimeEqual(verificationCodeValue, '123456');
			if (cancelled) return;

			if (ok) {
				setRegisterStep(3);
				return;
			}

			setCodeAttempts((prev) => prev + 1);
			setVerificationError('That code was not correct. Please try again.');
			setVerificationCode(Array(6).fill(''));
			setTimeout(() => verificationRefs.current[0]?.focus(), 0);
		};

		run()
			.catch(() => {
				if (cancelled) return;
				setVerificationError('Verification failed. Please try again.');
			})
			.finally(() => {
				if (cancelled) return;
				setIsVerifyingCode(false);
			});

		return () => {
			cancelled = true;
		};
	}, [
		mode,
		registerStep,
		showManualCode,
		verificationComplete,
		verificationCodeValue,
		isVerifyingCode,
		codeAttempts,
		maxCodeAttempts,
	]);

	const onVerificationKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Backspace') {
			if (verificationCode[index]) {
				setVerificationDigit(index, '');
				return;
			}
			if (index > 0) {
				verificationRefs.current[index - 1]?.focus();
			}
		}

		if (e.key === 'ArrowLeft' && index > 0) {
			e.preventDefault();
			verificationRefs.current[index - 1]?.focus();
		}
		if (e.key === 'ArrowRight' && index < 5) {
			e.preventDefault();
			verificationRefs.current[index + 1]?.focus();
		}
	};

	const onVerificationPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
		e.preventDefault();
		const digits = e.clipboardData
			.getData('text')
			.replace(/\D/g, '')
			.slice(0, 6)
			.split('');
		if (digits.length === 0) return;
		setVerificationCode((prev) => {
			const next = [...prev];
			for (let i = 0; i < 6; i += 1) next[i] = digits[i] ?? '';
			return next;
		});
		verificationRefs.current[Math.min(digits.length, 6) - 1]?.focus();
	};

	useLayoutEffect(() => {
		if (mode !== 'register') return;
		const viewport = registerSliderViewportRef.current;
		if (!viewport) return;

		const update = () => {
			const width = Math.round(viewport.getBoundingClientRect().width);
			setRegisterPanelWidth(width);
		};
		update();

		const ro = new ResizeObserver(() => update());
		ro.observe(viewport);
		return () => ro.disconnect();
	}, [mode]);

	useLayoutEffect(() => {
		if (mode !== 'register') {
			setRegisterViewportHeight(0);
			return;
		}

		const activePanel = registerPanelRefs.current[registerStep - 1] ?? null;
		if (!activePanel) return;

		const update = () => {
			const height = Math.ceil(activePanel.getBoundingClientRect().height);
			setRegisterViewportHeight(height);
		};

		update();
		const ro = new ResizeObserver(() => update());
		ro.observe(activePanel);
		return () => ro.disconnect();
	}, [mode, registerStep]);

	return (
		<div className="bg-background-primary rounded-3xl p-6 max-w-lg w-full shadow-md flex flex-col">
			<form className="w-full flex flex-col items-center" onSubmit={onSubmit}>
				<h2 className="text-2xl font-semibold text-center w-full">
					{isRegister ? 'Create an Account' : 'Login to Your Account'}
				</h2>

				<div className="w-full flex flex-col items-center mt-4">
					{notice ? (
						<p className="text-green-700 text-sm mb-4 text-center">{notice}</p>
					) : null}
					{error ? (
						<p className="text-red-600 text-sm mb-4 text-center">{error}</p>
					) : null}

					{isRegister ? (
						<div className="w-full max-w-96">
							<div
								ref={registerSliderViewportRef}
								className="w-full overflow-hidden min-w-0 transition-[height] duration-500 ease-in-out"
								style={registerViewportHeight > 0 ? { height: `${registerViewportHeight}px` } : undefined}
							>
								<div
									className="flex w-full transition-transform duration-500 ease-in-out"
									style={
										registerPanelWidth > 0
											? {
												width: `${registerPanelWidth * 3}px`,
												transform: `translateX(-${(registerStep - 1) * registerPanelWidth}px)`,
											}
										: {
											width: '300%',
											transform: `translateX(-${(registerStep - 1) * (100 / 3)}%)`,
										}
									}
								>
									{/* Step 1: email */}
									<div
										ref={(el) => {
											registerPanelRefs.current[0] = el;
										}}
										className="shrink-0 w-full"
										style={
											registerPanelWidth > 0
												? { width: `${registerPanelWidth}px` }
												: { width: `${100 / 3}%` }
										}
									>
										<div className="mb-4 relative group w-full">
											<input
												type="email"
												id="register-email"
												required
												className={emailInputClass}
												placeholder=" "
												value={form.email}
												onChange={(e) => {
													if (!touched.email) setTouched((prev) => ({ ...prev, email: true }));
													setForm((prev) => ({ ...prev, email: e.target.value }));
												}}
											/>
											<label htmlFor="register-email" className={emailLabelClass}>
												Email Address
											</label>
										</div>

										<button type="submit" className={buttonClassName} disabled={!emailIsValid}>
											Next
										</button>

										<p className="mt-4 text-sm text-center">
											We’ll send a verification link to your email.
										</p>
									</div>

									{/* Step 2: verify */}
									<div
										ref={(el) => {
											registerPanelRefs.current[1] = el;
										}}
										className="shrink-0 w-full"
										style={
											registerPanelWidth > 0
												? { width: `${registerPanelWidth}px` }
												: { width: `${100 / 3}%` }
										}
									>
										<div className="w-full flex flex-col items-center">
											<p className="text-center font-medium mb-2">Check your inbox</p>
											<p className="text-sm text-center text-text-secondary mb-4">
												We sent a verification email to{' '}
												<span className="font-medium">{form.email || 'your email'}</span>.
											</p>
											<p className="text-xs text-center text-text-secondary mb-4">
												Didn&apos;t get it yet? Check spam or wait a minute.
											</p>

											{verificationError ? (
												<p className="text-red-600 text-sm mb-3 text-center">{verificationError}</p>
											) : null}
											{codeAttempts >= maxCodeAttempts ? (
												<p className="text-red-600 text-sm mb-3 text-center">
													Too many attempts. Please request a new code.
												</p>
											) : null}

											{showManualCode ? (
												<div className="w-full">
													<p className="text-sm text-center text-text-secondary mb-2">
														Enter the 6-digit code
													</p>
													<div className="w-full flex justify-center gap-2 mb-3">
														{verificationCode.map((digit, index) => (
															<input
																key={index}
																ref={(el) => {
																	verificationRefs.current[index] = el;
																}}
																type="text"
																inputMode="numeric"
																autoComplete="one-time-code"
																maxLength={1}
																className="w-11 h-11 border border-gray-300 rounded-md text-center text-lg focus:outline-none focus:border-accent-main"
																value={digit}
																disabled={isVerifyingCode || codeAttempts >= maxCodeAttempts}
																onChange={(e) => setVerificationDigit(index, e.target.value)}
																onKeyDown={(e) => onVerificationKeyDown(index, e)}
																onPaste={onVerificationPaste}
																aria-label={`Verification digit ${index + 1}`}
															/>
														))}
													</div>
													{isVerifyingCode ? (
														<p className="text-xs text-center text-text-secondary">Verifying…</p>
													) : (
														<p className="text-xs text-center text-text-secondary">
															Verification happens automatically.
														</p>
													)}
												</div>
											) : (
												<p className="text-sm text-center">
													<button
														type="button"
														className="text-accent-main font-medium"
														onClick={() => {
															setShowManualCode(true);
															setVerificationError(null);
															setTimeout(() => verificationRefs.current[0]?.focus(), 0);
														}}
													>
														Using a different device?
													</button>
												</p>
											)}

											<button
												type="button"
												className={buttonClassName}
												onClick={() => {
													setRegisterStep(1);
													setShowManualCode(false);
													setVerificationError(null);
													setVerificationCode(Array(6).fill(''));
													setCodeAttempts(0);
												}}
											>
												Use a different email
											</button>
										</div>
									</div>

									{/* Step 3: create password */}
									<div
										ref={(el) => {
											registerPanelRefs.current[2] = el;
										}}
										className="shrink-0 w-full"
										style={
											registerPanelWidth > 0
												? { width: `${registerPanelWidth}px` }
												: { width: `${100 / 3}%` }
										}
									>
										<div className="w-full flex flex-col items-center">
											<p className="text-center font-medium mb-2">Create a password</p>
											<p className="text-sm text-center text-text-secondary mb-4">
												This will be used to log in securely.
											</p>

											<div className="w-full mb-3 relative group">
												<input
													type={showRegisterPassword ? 'text' : 'password'}
													id="register-password"
													required
													className={
														inputClassName +
														' pr-10' +
														(showRegisterPassword ? '' : ' tracking-[0.2rem]')
													}
													placeholder=" "
													value={registerPassword}
													onChange={(e) => setRegisterPassword(e.target.value)}
													autoComplete="new-password"
													spellCheck={false}
											/>
											<button
												type="button"
												aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
												onMouseDown={(e) => e.preventDefault()}
												onClick={() => setShowRegisterPassword((prev) => !prev)}
												className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
											>
												{showRegisterPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
											</button>
											<label
												htmlFor="register-password"
												className={labelBaseClass + ' peer-focus:text-accent-text'}
											>
												Password
											</label>
											</div>

											<div className="w-full mb-4 relative group">
												<input
													type={showRegisterPasswordConfirm ? 'text' : 'password'}
													id="register-password-confirm"
													required
													className={
														inputClassName +
														' pr-10' +
														(showRegisterPasswordConfirm ? '' : ' tracking-[0.2rem]')
												}
													placeholder=" "
													value={registerPasswordConfirm}
													onChange={(e) => setRegisterPasswordConfirm(e.target.value)}
													autoComplete="new-password"
													spellCheck={false}
												/>
												<button
													type="button"
													aria-label={showRegisterPasswordConfirm ? 'Hide password' : 'Show password'}
													onMouseDown={(e) => e.preventDefault()}
													onClick={() => setShowRegisterPasswordConfirm((prev) => !prev)}
													className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
												>
													{showRegisterPasswordConfirm ? (
														<EyeOff className="size-5" />
													) : (
														<Eye className="size-5" />
													)}
												</button>
												<label
													htmlFor="register-password-confirm"
													className={labelBaseClass + ' peer-focus:text-accent-text'}
												>
													Confirm password
												</label>
											</div>

											{(() => {
												const p = registerPassword;
												const criteria = [
													{ ok: p.length >= 8, label: 'At least 8 characters' },
													{ ok: /[a-z]/.test(p), label: 'Lowercase letter' },
													{ ok: /[A-Z]/.test(p), label: 'Uppercase letter' },
													{ ok: /\d/.test(p), label: 'Number' },
													{ ok: /[^A-Za-z0-9]/.test(p), label: 'Symbol' },
													{ ok: !/\s/.test(p), label: 'No spaces' },
												];
												return (
													<div className="w-full mb-4">
														<p className="text-sm text-center text-text-secondary mb-2">Password must include:</p>
														<div className="grid grid-cols-1 gap-2">
															{criteria.map((c) => (
																<div key={c.label} className="flex items-center gap-2 text-sm">
																	<span
																		className={
																			'inline-block size-2.5 rounded-full border ' +
																			(c.ok ? 'bg-accent-main border-accent-main' : 'border-gray-400')
																		}
																	/>
																	<span className={c.ok ? 'text-text-primary' : 'text-text-secondary'}>
																		{c.label}
																	</span>
																</div>
															))}
														</div>
													</div>
												);
											})()}

											<button type="submit" className={buttonClassName}>
												Create account
											</button>

											<button
												type="button"
												className={buttonClassName}
												onClick={() => {
													setRegisterStep(2);
													setError(null);
													setNotice(null);
												}}
											>
												Back
											</button>
										</div>
									</div>
								</div>
							</div>
						</div>
					) : (
						<div className="w-full max-w-96">
							<div className="mb-4 relative group w-full">
								<input
									type="email"
									id="email"
									required
									className={emailInputClass}
									placeholder=" "
									value={form.email}
									onChange={(e) => {
										if (!touched.email) setTouched((prev) => ({ ...prev, email: true }));
										setForm((prev) => ({ ...prev, email: e.target.value }));
									}}
								/>
								<label htmlFor="email" className={emailLabelClass}>
									Email Address
								</label>
							</div>
							<div className="mb-4 relative group w-full">
								<input
									type={showPassword ? 'text' : 'password'}
									id="password"
									required
									className={
										passwordInputClass +
										' pr-10' +
										(showPassword ? '' : ' tracking-[0.2rem]')
									}
									placeholder=" "
									value={form.password}
									onChange={(e) => {
													if (!touched.password) setTouched((prev) => ({ ...prev, password: true }));
													setForm((prev) => ({ ...prev, password: e.target.value }));
												}}
								/>
								<button
									type="button"
									aria-label={showPassword ? 'Hide password' : 'Show password'}
									onMouseDown={(e) => e.preventDefault()}
									onClick={() => setShowPassword((prev) => !prev)}
									className="absolute right-3 top-1/2 -translate-y-1/2 text-text-secondary hover:text-text-primary"
								>
									{showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
								</button>
								<label htmlFor="password" className={passwordLabelClass}>
									Password
								</label>
							</div>
							<button type="submit" disabled={isSubmitting} className={buttonClassName}>
								{isSubmitting ? 'Logging in…' : 'Login'}
							</button>
						</div>
						
					)}

					<p className="mt-4 text-sm text-center">
						{isRegister ? 'Already have an account?' : 'Are you new?'}
						<button
							type="button"
							onClick={() => {
								setError(null);
								setNotice(null);
								setIsSubmitting(false);
								setMode((prev) => (prev === 'login' ? 'register' : 'login'));
								setRegisterStep(1);
								setShowManualCode(false);
								setVerificationError(null);
								setVerificationCode(Array(6).fill(''));
								setCodeAttempts(0);
								setRegisterPassword('');
								setRegisterPasswordConfirm('');
								setForm((prev) => ({ ...prev, password: '' }));
							}}
							className="text-accent-text font-medium ml-1"
						>
							{isRegister ? 'Login' : 'Register'}
						</button>
					</p>
				</div>
			</form>
		</div>
	);
}