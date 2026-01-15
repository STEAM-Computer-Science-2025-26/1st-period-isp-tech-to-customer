"use client";

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { LoginInput, LoginSuccess } from '@/lib/types/userTypes';

export default function LoginForm() {
	const router = useRouter();
	const [form, setForm] = useState<LoginInput>({ email: '', password: '' });
	const [error, setError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
		e.preventDefault();
		setError(null);
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
	}

	return (
		<div className="bg-background-primary/70 rounded-3xl p-6 max-w-lg w-full h-96 shadow-md">
			<form className="w-full h-full flex flex-col justify-center items-center" onSubmit={onSubmit}>
				<h2 className="text-2xl font-semibold mb-6 text-center">Login to Your Account</h2>
				{error ? (
					<p className="text-red-600 text-sm mb-4 text-center">{error}</p>
				) : null}
				<div className="mb-4 w-full max-w-96">
					<label htmlFor="email" className="block text-sm font-medium mb-2">
						Email Address
					</label>
					<input
						type="email"
						id="email"
						required
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter your email"
						value={form.email}
						onChange={(e) => setForm((prev) => ({ ...prev, email: e.target.value }))}
					/>
				</div>
				<div className="mb-4 w-full max-w-96">
					<label htmlFor="password" className="block text-sm font-medium mb-2">
						Password
					</label>
					<input
						type="password"
						id="password"
						required
						className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
						placeholder="Enter your password"
						value={form.password}
						onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
					/>
				</div>
				<button
					type="submit"
					disabled={isSubmitting}
					className="bg-blue-500 max-w-96 w-full text-white py-2 px-4 rounded-md hover:bg-blue-600 transition-colors disabled:opacity-60"
				>
					{isSubmitting ? 'Logging in…' : 'Login'}
				</button>
			</form>
		</div>
	);
}