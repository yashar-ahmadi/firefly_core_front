import type { ComponentProps } from 'react'
import { cn } from './cn'

/**
 * A grey placeholder block with a soft shimmer. Size and shape come from `className`
 * (e.g. `h-4 w-2/3`, `aspect-square rounded-card`, `size-10 rounded-full`). Hidden from
 * assistive tech: announce loading once on the container instead (`aria-busy`).
 */
export function Skeleton({ className, ...props }: ComponentProps<'div'>) {
  return (
    <div
      aria-hidden
      className={cn(
        'rounded-control bg-ink-100 bg-linear-to-r from-transparent via-white/70 to-transparent',
        'bg-[length:200%_100%] bg-no-repeat motion-safe:animate-shimmer',
        className,
      )}
      {...props}
    />
  )
}
