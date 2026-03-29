import { ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import clsx from "clsx";

export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

export {
	formatReadableDate,
	formatReadableDateTime,
	formatReadableShortDateTime,
	formatRelativeTime
} from "./dateTime";
