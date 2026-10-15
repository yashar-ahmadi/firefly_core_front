import { cn } from './cn'

// Class recipes shared by Button, IconButton and links styled as buttons.

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger' | 'link'
export type ButtonSize = 'sm' | 'md' | 'lg'

/**
 * Extends the hit area of a control drawn 40px high to 44px (WCAG 2.5.5) without changing
 * its layout. Needs `relative` on the element.
 */
export const HIT_AREA = 'after:absolute after:-inset-y-0.5 after:inset-x-0'
/** The same for a 40px square control: 44px in both directions. */
export const HIT_AREA_SQUARE = 'after:absolute after:-inset-0.5'

const BASE = cn(
  'relative inline-flex shrink-0 items-center justify-center gap-2 font-medium whitespace-nowrap select-none',
  'transition-[color,background-color,border-color,box-shadow,transform] duration-150 ease-out',
  'motion-safe:active:scale-[0.98] disabled:cursor-not-allowed aria-disabled:pointer-events-none',
  '[&_svg]:shrink-0',
)

const VARIANTS: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-brand-fg shadow-sm hover:bg-brand-700 active:bg-brand-800',
  secondary: 'bg-brand-50 text-brand-800 hover:bg-brand-100 active:bg-brand-200',
  outline:
    'border border-ink-300 bg-white text-ink-800 hover:border-ink-400 hover:bg-ink-50 active:bg-ink-100',
  ghost: 'text-ink-700 hover:bg-ink-100 active:bg-ink-200',
  danger: 'bg-danger text-danger-fg shadow-sm hover:bg-danger/90 active:bg-danger/80',
  link: 'text-brand-700 decoration-2 underline-offset-4 hover:underline',
}

const SIZES: Record<ButtonSize, string> = {
  sm: cn('h-10 rounded-control px-3.5 text-sm [&_svg]:size-4', HIT_AREA),
  md: 'h-11 rounded-control px-5 text-base [&_svg]:size-5',
  lg: 'h-13 rounded-control px-7 text-lg [&_svg]:size-5',
}

export function buttonClasses({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
} = {}): string {
  return cn(
    BASE,
    SIZES[size],
    VARIANTS[variant],
    variant === 'link' && 'h-auto rounded-sm px-0 motion-safe:active:scale-100',
    fullWidth && 'w-full',
  )
}

const ICON_SIZES: Record<ButtonSize, string> = {
  sm: cn('size-10 [&_svg]:size-5', HIT_AREA_SQUARE),
  md: 'size-11 [&_svg]:size-5',
  lg: 'size-13 [&_svg]:size-6',
}

export function iconButtonClasses({
  variant = 'ghost',
  size = 'md',
}: {
  variant?: Exclude<ButtonVariant, 'link'>
  size?: ButtonSize
} = {}): string {
  return cn(BASE, VARIANTS[variant], ICON_SIZES[size], 'rounded-full px-0')
}
