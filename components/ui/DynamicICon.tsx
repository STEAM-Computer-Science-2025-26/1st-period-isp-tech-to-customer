"use client";

import dynamic from "next/dynamic";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { LucideProps } from "lucide-react";
import { type ComponentType, FC, memo } from "react";

export type IconName = keyof typeof dynamicIconImports;

interface DynamicIconProps extends LucideProps {
	name: IconName;
}

type IconComponent = ComponentType<LucideProps>;

const iconComponents = Object.fromEntries(
	Object.entries(dynamicIconImports).map(([name, loader]) => [
		name,
		dynamic(loader, { ssr: false, loading: () => <div>Loading icon...</div> })
	])
) as Record<IconName, IconComponent>;

const DynamicIcon: FC<DynamicIconProps> = memo(({ name, ...props }) => {
	const LucideIcon = iconComponents[name];
	return <LucideIcon {...props} />;
});

DynamicIcon.displayName = "DynamicIcon";

export default DynamicIcon;
