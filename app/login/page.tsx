import LoginForm from "@/components/layout/LoginForm";

export default function LoginPage() {
	return (
		<div className="w-full h-screen flex items-center justify-center px-10 overflow-hidden">
			<LoginForm registering={false} />
		</div>
	);
}
