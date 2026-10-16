import { Slot } from 'radix-ui'
import type { ComponentProps, ReactNode, Ref } from 'react'
import { buttonClasses, type ButtonSize, type ButtonVariant } from './button-styles'
import { cn } from './cn'
import { Spinner } from './spinner'

export type { ButtonSize, ButtonVariant } from './button-styles'

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant
  /** `md` is 44px high; `sm` is drawn at 40px with a 44px hit area. */
  size?: ButtonSize
  /** Disables the button, sets `aria-busy` and shows a spinner (the width does not change). */
  loading?: boolean
  fullWidth?: boolean
  /** Render the single child element (e.g. a Next `Link`) with the button styles. */
  asChild?: boolean
  iconStart?: ReactNode
  iconEnd?: ReactNode
}

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  fullWidth = false,
  asChild = false,
  iconStart,
  iconEnd,
  className,
  children,
  disabled,
  type,
  ref,
  ...props
}: ButtonProps) {
  const classes = cn(
    buttonClasses({ variant, size, fullWidth }),
    // An asChild element (a link) has no :disabled state; aria-disabled dims it instead.
    loading ? 'cursor-wait' : 'disabled:opacity-50 aria-disabled:opacity-50',
    className,
  )

  if (asChild) {
    return (
      <Slot.Root
        ref={ref as Ref<HTMLElement>}
        className={classes}
        aria-busy={loading || undefined}
        aria-disabled={disabled || loading || undefined}
        {...props}
      >
        {iconStart}
        <Slot.Slottable>{children}</Slot.Slottable>
        {iconEnd}
      </Slot.Root>
    )
  }

  const spinner = <Spinner size={size === 'sm' ? 'sm' : 'md'} />
  // Without a start icon the spinner sits on top of the (transparent) label, keeping the width.
  const overlay = loading && !iconStart
  const content = (
    <>
      {children}
      {iconEnd}
    </>
  )

  return (
    <button
      ref={ref}
      type={type ?? 'button'}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {overlay && <span className="absolute inset-0 grid place-items-center">{spinner}</span>}
      {loading && iconStart ? spinner : iconStart}
      {overlay ? (
        <span className="inline-flex items-center gap-[inherit] opacity-0">{content}</span>
      ) : (
        content
      )}
    </button>
  )
}
