import { cn } from '@/lib/utils/index';
import DynamicIcon from './DynamicICon';
import { IconName } from './DynamicICon';

import React from 'react'

const Fab = ({size, icon, onClick, className, iconClassName, ...props}:{size: "sm" | "md" | "lg", icon: IconName, onClick: () => void, className?: string, iconClassName?: string, [key: string]: any}) => {
  return (

	<button className={cn(`fixed bottom-2 right-2 bg-background-secondary/50 text-text-secondary rounded-lg flex flex-row items-center justify-center p-2 border border-background-secondary`, size === "sm" ? "size-8" : size === "lg" ? "size-12" : "size-10", className)} onClick={onClick} {...props}>
		<DynamicIcon name={icon} size={size === "sm" ? 16 : size === "lg" ? 24 : 32} className={iconClassName} />
	</button>
  )
}

export default Fab