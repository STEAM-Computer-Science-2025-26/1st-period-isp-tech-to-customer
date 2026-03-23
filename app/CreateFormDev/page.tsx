import { cn } from "@/lib/utils/index";
import { ClassValue } from "clsx";
import CreateForm from "@/components/layout/createForm/CreateForm";

export default function CreateFormDev() {
	return (
		<div className={cn(`w-full h-screen flex items-center justify-center`)}>
			<CreateForm />
		</div>
	);
}
