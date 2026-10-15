import { Check, X } from 'lucide-react'
import type { ComponentProps, ReactNode } from 'react'
import { HIT_AREA } from './button-styles'
import { cn } from './cn'

export interface ChipProps extends ComponentProps<'button'> {
  /** Toggle chip: sets `aria-pressed` and shows a check mark when selected. */
  selected?: boolean
  /** Removable chip (an applied filter): shows a cross at the end. Give it an `aria-label`. */
  removable?: boolean
  icon?: ReactNode
}

/** A pill-shaped button for filters and quick choices: 40px tall with a 44px hit area. */
export function Chip({
  selected,
  removable = false,
  icon,
  className,
  children,
  type,
  ...props
}: ChipProps) {
  const toggle = !removable && selected !== undefined
  return (
    <button
      type={type ?? 'button'}
      aria-pressed={toggle ? selected : undefined}
      className={cn(
        'relative inline-flex h-10 shrink-0 items-center gap-1.5 rounded-pill border px-4 text-sm font-medium whitespace-nowrap',
        'transition-[color,background-color,border-color,transform] duration-150 motion-safe:active:scale-[0.97]',
        'disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4 [&_svg]:shrink-0',
        HIT_AREA,
        selected
          ? 'border-brand bg-brand-50 text-brand-800 hover:bg-brand-100'
          : 'border-ink-300 bg-white text-ink-700 hover:border-ink-400 hover:bg-ink-50',
        removable && 'pe-3',
        className,
      )}
      {...props}
    >
      {toggle && selected ? <Check aria-hidden strokeWidth={2.5} /> : icon}
      {children}
      {removable && <X aria-hidden className="text-ink-500" />}
    </button>
  )
}
