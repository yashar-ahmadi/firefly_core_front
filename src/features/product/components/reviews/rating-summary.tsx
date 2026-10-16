import { Star } from 'lucide-react'
import { Rating } from '@/components/ui/rating'
import type { ProductDetail, RatingBreakdownRow } from '@/lib/api/types/catalog'
import { formatNumber } from '@/lib/format'

const NONE = 'هنوز امتیازی ثبت نشده است.'

/** The five rows from 5 to 1 (the API's order, kept even if it changed), percents in range. */
function rows(breakdown: readonly RatingBreakdownRow[]): RatingBreakdownRow[] {
  return [...breakdown]
    .sort((a, b) => b.score - a.score)
    .map((row) => ({ ...row, percent: Math.min(100, Math.max(0, row.percent)) }))
}

/**
 * The reviews' summary (product digest §8): the average out of five with its stars, how many
 * rated, and one bar per score from 5 to 1. Each bar is an image named by its score and count
 * («۵ ستاره: ۱ نفر»); the numbers beside it are for the eye. Before any rating, a line instead.
 */
export function RatingSummary({
  product,
}: {
  product: Pick<ProductDetail, 'rating' | 'rating_count' | 'rating_breakdown'>
}) {
  if (product.rating <= 0 || product.rating_count <= 0) {
    return <p className="text-base text-ink-600">{NONE}</p>
  }
  return (
    <div className="flex max-w-md flex-col gap-4">
      <div className="flex items-center gap-3">
        <span aria-hidden className="text-5xl leading-none font-bold text-ink-900">
          {formatNumber(Math.round(product.rating * 10) / 10)}
        </span>
        <div className="flex flex-col gap-1">
          <Rating value={product.rating} showValue={false} />
          <span className="text-sm text-ink-600">
            {`بر اساس ${formatNumber(product.rating_count)} امتیاز`}
          </span>
        </div>
      </div>
      <ul aria-label="امتیازها" className="flex flex-col gap-1.5">
        {rows(product.rating_breakdown).map((row) => (
          <li key={row.score} className="flex items-center gap-2 text-sm text-ink-700">
            <span aria-hidden className="flex w-7 shrink-0 items-center gap-0.5 tabular-nums">
              {formatNumber(row.score)}
              <Star className="size-3.5 fill-current text-accent-400" />
            </span>
            <span
              role="img"
              aria-label={`${formatNumber(row.score)} ستاره: ${formatNumber(row.count)} نفر`}
              className="h-2 min-w-0 flex-1 overflow-hidden rounded-pill bg-ink-100"
            >
              <span
                className="block h-full rounded-pill bg-accent-400"
                style={{ width: `${row.percent}%` }}
              />
            </span>
            <span aria-hidden className="w-7 shrink-0 text-end tabular-nums">
              {formatNumber(row.count)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
