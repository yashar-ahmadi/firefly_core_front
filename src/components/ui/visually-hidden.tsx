import type { ComponentProps } from 'react'
import { cn } from './cn'

/** Text for screen readers only: it takes no space on screen. */
export function VisuallyHidden({ className, ...props }: ComponentProps<'span'>) {
  return <span className={cn('sr-only', className)} {...props} />
}
