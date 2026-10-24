'use client'

import { Minus, Plus, Trash2 } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { HIT_AREA_SQUARE } from './button-styles'
import { cn } from './cn'
import { Spinner } from './spinner'

export type QuantityStepperSize = 'sm' | 'md'

export interface QuantityStepperProps {
  value: number
  min?: number
  /** Upper limit; `0` or `null` means unlimited. */
  max?: number | null
  onChange: (value: number) => void
  /** When given, the minus button turns into «حذف» (a bin) at `min`. */
  onRemove?: () => void
  /**
   * Both buttons wait and a spinner shows over the number (e.g. while the cart saves). A button
   * that cannot be used now is `aria-disabled` and ignores presses, never `disabled`: a disabled
   * button that held the focus would drop it to the page.
   */
  loading?: boolean
  /** `md` buttons are 44px; `sm` buttons are drawn at 40px with a 44px hit area. */
  size?: QuantityStepperSize
  className?: string
}

const BUTTON = cn(
  'relative grid shrink-0 place-items-center rounded-[calc(var(--radius-control)-1px)] text-brand-700',
  'transition-[background-color,color,transform] duration-150 hover:bg-brand-50 active:bg-brand-100',
  'motion-safe:active:scale-95 aria-disabled:cursor-not-allowed aria-disabled:text-ink-300 aria-disabled:hover:bg-transparent',
  '[&_svg]:size-5',
)

const SIZES: Record<QuantityStepperSize, { button: string; value: string }> = {
  sm: { button: cn('size-10', HIT_AREA_SQUARE), value: 'min-w-8 text-base' },
  md: { button: 'size-11', value: 'min-w-10 text-lg' },
}

/** − value + control for quantities, with Persian digits; the number is not free text. */
export function QuantityStepper({
  value,
  min = 1,
  max,
  onChange,
  onRemove,
  loading = false,
  size = 'md',
  className,
}: QuantityStepperProps) {
  const s = SIZES[size]
  const unlimited = max == null || max <= 0
  const canIncrease = !loading && (unlimited || value < max)
  const atMin = value <= min

  return (
    <div
      role="group"
      aria-label="تعداد"
      className={cn(
        'inline-flex items-center rounded-control border border-ink-300 bg-white shadow-sm',
        className,
      )}
    >
      <button
        type="button"
        aria-label="افزایش تعداد"
        aria-disabled={!canIncrease || undefined}
        onClick={() => canIncrease && onChange(value + 1)}
        className={cn(BUTTON, s.button)}
      >
        <Plus aria-hidden strokeWidth={2.5} />
      </button>
      <span
        aria-live="polite"
        className={cn(
          'relative grid place-items-center px-1 text-center font-bold text-ink-900 tabular-nums',
          s.value,
        )}
      >
        <span className={cn(loading && 'opacity-0')}>{formatNumber(value)}</span>
        {loading && (
          <span className="absolute inset-0 grid place-items-center text-brand-600">
            <Spinner size="sm" />
          </span>
        )}
      </span>
      {atMin && onRemove ? (
        <button
          type="button"
          aria-label="حذف"
          aria-disabled={loading || undefined}
          onClick={() => !loading && onRemove()}
          className={cn(BUTTON, s.button, 'text-danger hover:bg-danger/10 active:bg-danger/15')}
        >
          <Trash2 aria-hidden />
        </button>
      ) : (
        <button
          type="button"
          aria-label="کاهش تعداد"
          aria-disabled={loading || atMin || undefined}
          onClick={() => !loading && !atMin && onChange(value - 1)}
          className={cn(BUTTON, s.button)}
        >
          <Minus aria-hidden strokeWidth={2.5} />
        </button>
      )}
    </div>
  )
}
