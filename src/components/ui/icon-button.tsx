import type { ComponentProps, ReactNode } from 'react'
import { iconButtonClasses, type ButtonSize, type ButtonVariant } from './button-styles'
import { cn } from './cn'
import { Spinner } from './spinner'

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Accessible name; required because the button shows only an icon. */
  label: string
  icon: ReactNode
  variant?: Exclude<ButtonVariant, 'link'>
  size?: ButtonSize
  loading?: boolean
}

/** A round icon-only button (44px at `md`). */
export function IconButton({
  label,
  icon,
  variant = 'ghost',
  size = 'md',
  loading = false,
  className,
  disabled,
  type,
  ...props
}: IconButtonProps) {
  return (
    <button
      type={type ?? 'button'}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={disabled || loading}
      className={cn(
        iconButtonClasses({ variant, size }),
        loading ? 'cursor-wait' : 'disabled:opacity-50',
        className,
      )}
      {...props}
    >
      {loading ? <Spinner size={size === 'sm' ? 'sm' : 'md'} /> : icon}
    </button>
  )
}
