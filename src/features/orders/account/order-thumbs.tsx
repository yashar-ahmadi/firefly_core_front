import { Package } from 'lucide-react'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { OrderLinePreview } from '@/lib/api/types/order-detail'
import { formatNumber } from '@/lib/format'

// An order card's pictures (order digest §6.3): the first lines the list gives (`item_preview`,
// three at most), each 48px and square, a line of more than one unit with its quantity on it
// («×۲»), then «+n» for the lines not shown (`line_count` less those shown; J-33). The card says
// the units in words (`item_count`); the strip is decoration.

const SHOWN = 3
const TILE = 'size-12 shrink-0 overflow-hidden rounded-control'

export function OrderThumbs({
  preview,
  lineCount,
}: {
  preview: OrderLinePreview[]
  /** Every line of the order (`line_count`). */
  lineCount: number
}) {
  const shown = preview.slice(0, SHOWN)
  if (shown.length === 0) return null
  const more = Math.max(0, lineCount - shown.length)
  return (
    <div aria-hidden className="flex items-center gap-2">
      {shown.map((line, index) => (
        <div key={`${line.product_name}-${index}`} className="relative shrink-0">
          {line.image ? (
            <SmartImage
              src={line.image}
              alt=""
              ratio="1/1"
              sizes="48px"
              className={cn(TILE, 'border border-ink-100 bg-ink-50')}
            />
          ) : (
            <span className={cn(TILE, 'grid place-items-center bg-ink-50 text-ink-400')}>
              <Package className="size-6" />
            </span>
          )}
          {line.quantity > 1 && (
            <span
              data-quantity=""
              dir="ltr"
              className="absolute -end-1 -bottom-1 rounded-pill bg-ink-900 px-1.5 text-xs leading-5 font-bold text-white tabular-nums"
            >
              {`×${formatNumber(line.quantity)}`}
            </span>
          )}
        </div>
      ))}
      {more > 0 && (
        <span
          data-more=""
          dir="ltr"
          className={cn(
            TILE,
            'grid place-items-center bg-ink-100 text-sm font-bold text-ink-700 tabular-nums',
          )}
        >
          {`+${formatNumber(more)}`}
        </span>
      )}
    </div>
  )
}
