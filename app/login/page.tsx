import LoginForm from "@/components/layout/LoginForm";
import { validateEmail } from "@/components/layout/loginForm/validation";

export default async function LoginPage({
	searchParams
}: {
	searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
	const sp = searchParams ? await searchParams : {};
	const registerParam = sp.register;
	const stageParam = sp.stage;
	const emailParam = sp.email;

	const registering = registerParam === "1" || registerParam === "true";
	const parsedStage = stageParam === "2" ? 2 : stageParam === "3" ? 3 : 1;
	const email = typeof emailParam === "string" ? emailParam : undefined;
	const validatedEmail = email
		? (() => {
				const result = validateEmail(email);
				return result.ok ? result.value : undefined;
			})()
		: undefined;

	return (
		<div className="w-full h-screen flex items-center justify-center px-10 overflow-hidden">
			<LoginForm
				registering={registering}
				initialStage={parsedStage}
				email={validatedEmail}
			/>
		</div>
	);
}
