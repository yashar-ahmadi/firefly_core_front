import { cn } from './cn'

// Shared look of text-like form controls (Input, Textarea, Select, OtpInput boxes).
// The border is ink-400 rather than a lighter grey so the field outline stays visible for
// older eyes; focus adds the theme's focus colour (3:1 on the page) and a soft brand halo.

const FRAME =
  'rounded-control border border-ink-400 bg-white text-base text-ink-900 transition-[border-color,box-shadow]'
const HOVER = 'hover:border-ink-500'
const INVALID = 'border-danger hover:border-danger'
const DISABLED = 'cursor-not-allowed bg-ink-100 text-ink-500 hover:border-ink-400'

/** Classes for an element that is itself the focusable control (textarea, select). */
export function controlClasses({
  invalid = false,
  disabled = false,
}: { invalid?: boolean; disabled?: boolean } = {}): string {
  return cn(
    FRAME,
    HOVER,
    'placeholder:text-ink-500 focus-visible:outline-none',
    'focus:border-(--focus) focus:ring-4 focus:ring-brand-500/15',
    invalid && cn(INVALID, 'focus:border-danger focus:ring-danger/15'),
    disabled && DISABLED,
  )
}

/** Classes for a wrapper around a focusable control (an input with adornments). */
export function controlFrameClasses({
  invalid = false,
  disabled = false,
}: { invalid?: boolean; disabled?: boolean } = {}): string {
  return cn(
    FRAME,
    HOVER,
    'focus-within:border-(--focus) focus-within:ring-4 focus-within:ring-brand-500/15',
    invalid && cn(INVALID, 'focus-within:border-danger focus-within:ring-danger/15'),
    disabled && DISABLED,
  )
}

/** Whether an `aria-invalid` prop value means "invalid". */
export function isInvalid(value: unknown): boolean {
  return value === true || value === 'true' || value === 'grammar' || value === 'spelling'
}
