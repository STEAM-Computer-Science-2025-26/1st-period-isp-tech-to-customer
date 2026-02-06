const colorNames =
	"slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|primary|secondary|tertiary|text-primary|text-secondary|text-tertiary|text-accent-dark|text-accent-dark-2";

const colorPattern = new RegExp(
	`^(bg|text|border)-(${colorNames})(-\\d{2,3})?(\\/(0|[1-9]\\d|100))?$`
);

export default {
	content: [
		"./app/**/*.{js,ts,jsx,tsx,mdx}",
		"./components/**/*.{js,ts,jsx,tsx,mdx}",
		"./pages/**/*.{js,ts,jsx,tsx,mdx}",
		"./services/**/*.{js,ts,jsx,tsx}",
		"./db/**/*.{js,ts,jsx,tsx}",
		"./scripts/**/*.{js,ts,jsx,tsx}",
		"./**/*.{js,ts,jsx,tsx,mdx}"
	],
	safelist: [
		{
			pattern: colorPattern,
			variants: ["hover"]
		},
		{
			pattern: /^rounded-(sm|md|lg|xl|2xl|3xl|4xl|5xl|6xl|7xl)$/
		},
		{
			pattern: /^rounded-\[.*\]$/
		}
	]
};
