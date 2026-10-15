import type { ComponentProps } from 'react'
import { cn } from './cn'

export type BadgeTone =
  'neutral' | 'brand' | 'accent' | 'success' | 'warning' | 'danger' | 'info' | 'sale'

const SOFT: Record<BadgeTone, string> = {
  neutral: 'bg-ink-100 text-ink-700',
  brand: 'bg-brand-50 text-brand-800',
  accent: 'bg-accent-50 text-accent-900',
  success: 'bg-success/10 text-success',
  warning: 'bg-warning/10 text-warning',
  danger: 'bg-danger/10 text-danger',
  info: 'bg-info/10 text-info',
  sale: 'bg-sale/10 text-sale',
}

const SOLID: Record<BadgeTone, string> = {
  neutral: 'bg-ink-800 text-white',
  brand: 'bg-brand text-brand-fg',
  accent: 'bg-accent text-accent-fg',
  success: 'bg-success text-success-fg',
  warning: 'bg-warning text-warning-fg',
  danger: 'bg-danger text-danger-fg',
  info: 'bg-info text-info-fg',
  sale: 'bg-sale text-sale-fg',
}

export interface BadgeProps extends ComponentProps<'span'> {
  tone?: BadgeTone
  /** `soft` is a tinted label; `solid` is a filled one for emphasis (e.g. on images). */
  variant?: 'soft' | 'solid'
  size?: 'sm' | 'md'
}

/** A small status or highlight label. Icons inside are sized automatically. */
export function Badge({
  tone = 'neutral',
  variant = 'soft',
  size = 'md',
  className,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-pill font-medium whitespace-nowrap [&_svg]:shrink-0',
        size === 'sm' ? 'h-6 px-2 text-xs [&_svg]:size-3.5' : 'h-7 px-2.5 text-sm [&_svg]:size-4',
        variant === 'solid' ? SOLID[tone] : SOFT[tone],
        className,
      )}
      {...props}
    />
  )
}
