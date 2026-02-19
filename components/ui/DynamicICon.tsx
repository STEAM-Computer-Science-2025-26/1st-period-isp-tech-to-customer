"use client";

import dynamic from "next/dynamic";
import dynamicIconImports from "lucide-react/dynamicIconImports";
import { LucideProps } from "lucide-react";
import { FC, memo } from "react";

export type IconName = keyof typeof dynamicIconImports;

interface DynamicIconProps extends LucideProps {
  name: IconName;
}

const DynamicIcon: FC<DynamicIconProps> = memo(({ name, ...props }) => {
  const LucideIcon = dynamic(dynamicIconImports[name], {
    ssr: false, 
    loading: () => <div>Loading icon...</div>,
  });

  return <LucideIcon {...props} />;
});

DynamicIcon.displayName = "DynamicIcon";

export default DynamicIcon;
