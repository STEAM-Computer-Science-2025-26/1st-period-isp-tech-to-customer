import React from 'react'
import { cn } from '@/lib/utils/index'

type FadeEndParams = {
	position: 'before' | 'after';
	width?: string;
	className?: string;
	orientation?: 'horizontal' | 'vertical';
}

const FadeEnd = ({ position, width, className, orientation }: FadeEndParams) => {
  return (
	<div className={cn(className, "")}></div>
  )
}

export default FadeEnd