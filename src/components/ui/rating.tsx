import { Star } from 'lucide-react'
import { formatNumber } from '@/lib/format'
import { cn } from './cn'
import { VisuallyHidden } from './visually-hidden'

export type RatingSize = 'sm' | 'md'

const SIZES: Record<RatingSize, { star: string; value: string; count: string }> = {
  sm: { star: 'size-4', value: 'text-sm', count: 'text-xs' },
  md: { star: 'size-5', value: 'text-base', count: 'text-sm' },
}

export interface RatingProps {
  /** Average score from 0 to 5. */
  value: number
  /** Number of ratings or reviews. */
  count?: number
  size?: RatingSize
  /** One star and the score, for narrow places such as product cards on phones. */
  compact?: boolean
  className?: string
}

function stars(className: string) {
  return Array.from({ length: 5 }, (_, i) => (
    <Star key={i} aria-hidden className={cn('shrink-0 fill-current', className)} />
  ))
}

/**
 * Five stars filled to the score (fractions included), the score and the rating count.
 * The stars are one image labelled «امتیاز ۴٫۵ از ۵». `compact` shows a single star instead.
 */
export function Rating({ value, count, size = 'md', compact = false, className }: RatingProps) {
  const s = SIZES[size]
  const score = Math.min(5, Math.max(0, Math.round((Number.isFinite(value) ? value : 0) * 10) / 10))
  const shownScore = formatNumber(score)
  const label = `امتیاز ${shownScore} از ۵`

  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5', className)}>
      {compact ? (
        <Star
          role="img"
          aria-label={label}
          className={cn('shrink-0 fill-current text-accent-400', s.star)}
        />
      ) : (
        <span role="img" aria-label={label} className="relative inline-flex">
          <span className="flex text-ink-200">{stars(s.star)}</span>
          {/* The filled copy is anchored at the start, so it fills from the right in RTL. */}
          <span
            className="absolute inset-y-0 start-0 flex overflow-hidden text-accent-400"
            style={{ width: `${(score / 5) * 100}%` }}
          >
            {stars(s.star)}
          </span>
        </span>
      )}
      <span aria-hidden className={cn('font-semibold text-ink-800', s.value)}>
        {shownScore}
      </span>
      {count !== undefined && (
        <span className={cn('text-ink-500', s.count)}>
          ({formatNumber(count)}
          <VisuallyHidden> نظر</VisuallyHidden>)
        </span>
      )}
    </span>
  )
}
