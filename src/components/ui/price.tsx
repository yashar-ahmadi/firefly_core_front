import { formatPercent, formatToman } from '@/lib/format'
import { cn } from './cn'
import { VisuallyHidden } from './visually-hidden'

export type PriceSize = 'sm' | 'md' | 'lg'

const SIZES: Record<PriceSize, { amount: string; unit: string; original: string; pill: string }> = {
  sm: { amount: 'text-base', unit: 'text-sm', original: 'text-sm', pill: 'h-6 px-1.5 text-sm' },
  md: { amount: 'text-lg', unit: 'text-sm', original: 'text-sm', pill: 'h-6 px-2 text-sm' },
  lg: { amount: 'text-2xl', unit: 'text-base', original: 'text-base', pill: 'h-7 px-2.5 text-sm' },
}

export interface PriceProps {
  /** Price to pay in Toman; `null` means not available for sale. */
  amount: number | null
  /** Price before discount; shown struck through when it is higher than `amount`. */
  original?: number | null
  /** Discount to show; computed from `original` when omitted. */
  discountPercent?: number
  size?: PriceSize
  /** De-emphasised, for something that cannot be bought now (an out-of-stock card). */
  muted?: boolean
  className?: string
}

/** «۹۰۰٬۰۰۰ تومان», with the struck original and a sale pill when discounted. */
export function Price({
  amount,
  original,
  discountPercent,
  size = 'md',
  muted = false,
  className,
}: PriceProps) {
  const s = SIZES[size]
  if (amount === null) {
    return (
      <span className={cn('inline-block font-medium text-ink-500', s.amount, className)}>
        ناموجود
      </span>
    )
  }

  const discounted = original != null && original > amount
  const percent = discounted
    ? Math.round(discountPercent ?? ((original - amount) / original) * 100)
    : 0

  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      {discounted && (
        <span className="flex items-center gap-2">
          {percent > 0 && (
            <span
              className={cn(
                'inline-flex items-center rounded-pill font-bold',
                muted ? 'bg-ink-100 text-ink-600' : 'bg-sale text-sale-fg',
                s.pill,
              )}
            >
              <VisuallyHidden>تخفیف </VisuallyHidden>
              {formatPercent(percent)}
            </span>
          )}
          {/* ink-500 keeps the text at AA contrast; the line itself is the lighter ink-400. */}
          <del className={cn('text-ink-500 decoration-ink-400', s.original)}>
            <VisuallyHidden>قیمت قبل: </VisuallyHidden>
            {formatToman(original, { suffix: false })}
          </del>
        </span>
      )}
      <span className="flex items-baseline gap-1">
        <span
          className={cn(
            'leading-tight font-bold',
            muted ? 'text-ink-500' : 'text-ink-900',
            s.amount,
          )}
        >
          {formatToman(amount, { suffix: false })}
        </span>{' '}
        <span className={cn('text-ink-500', s.unit)}>تومان</span>
      </span>
    </span>
  )
}
