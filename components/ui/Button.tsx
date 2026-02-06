import clsx from "clsx";

type P3Color =
	| "slate"
	| "gray"
	| "zinc"
	| "neutral"
	| "stone"
	| "red"
	| "orange"
	| "amber"
	| "yellow"
	| "lime"
	| "green"
	| "emerald"
	| "teal"
	| "cyan"
	| "sky"
	| "blue"
	| "indigo"
	| "violet"
	| "purple"
	| "fuchsia"
	| "pink"
	| "primary"
	| "secondary"
	| "tertiary"
	| "text-primary"
	| "text-secondary"
	| "text-tertiary"
	| "text-accent-dark"
	| "text-accent-dark-2";

type Shade =
	| "50"
	| "100"
	| "200"
	| "300"
	| "400"
	| "500"
	| "600"
	| "700"
	| "800"
	| "900"
	| "950";

type Opacity =
	| "0"
	| `${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}${0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9}`
	| "100";

type TailwindColor =
	| `${P3Color}-${Shade}/${Opacity}`
	| `${P3Color}/${Opacity}`
	| `${P3Color}/${Shade}`
	| P3Color;

type TailwindSizes =
	| "sm"
	| "md"
	| "lg"
	| "xl"
	| "2xl"
	| "3xl"
	| "4xl"
	| "5xl"
	| "6xl"
	| "7xl";

export default function Button({
	variant = "default",
	label,
	bg = "primary",
	bgHover = "secondary/50",
	border = "text-secondary",
	borderHover = "text-tertiary",
	text,
	textHover,
	rounded = "lg",
	className,
	...props
}: {
	variant?: "default";
	label: string;
	bg?: TailwindColor;
	bgHover?: TailwindColor;
	border?: TailwindColor;
	borderHover?: TailwindColor;
	text?: TailwindColor;
	textHover?: TailwindColor;
	rounded?: TailwindSizes | `${number}rem`;
	className?: string;
}) {
	const roundedClass =
		typeof rounded === "string" && rounded.endsWith("rem")
			? `rounded-[${rounded}]`
			: `rounded-${rounded}`;

	return (
		<button
			className={clsx(
				`bg-${bg} hover:bg-${bgHover} border border-${border} hover:border-${borderHover} px-3 py-2`,
				roundedClass,
				text && `text-${text}`,
				textHover && `hover:text-${textHover}`,
				className
			)}
			{...props}
		>
			{label}
		</button>
	);
}
