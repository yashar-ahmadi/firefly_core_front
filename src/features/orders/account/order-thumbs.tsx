import { Package } from 'lucide-react'
import { SmartImage } from '@/components/ui/smart-image'
import type { OrderLinePreview } from '@/lib/api/types/order-detail'
import { formatNumber } from '@/lib/format'

// An order card's pictures (order digest §6.3): the first lines the list gives (`item_preview`,
// three at most), each 48px and square, then «+n» when the preview is cut (three shown) and the
// order holds more units than that (`item_count` counts units, not lines, so fewer than three
// pictures show every line). Pictures are decoration: the card says the count in words.

const SHOWN = 3

export function OrderThumbs({
  preview,
  itemCount,
}: {
  preview: OrderLinePreview[]
  itemCount: number
}) {
  const shown = preview.slice(0, SHOWN)
  const more = shown.length === SHOWN && itemCount > SHOWN ? itemCount - SHOWN : 0
  if (shown.length === 0) return null
  return (
    <div aria-hidden className="flex items-center gap-2">
      {shown.map((line, index) =>
        line.image ? (
          <SmartImage
            key={`${line.product_name}-${index}`}
            src={line.image}
            alt=""
            ratio="1/1"
            sizes="48px"
            className="size-12 shrink-0 overflow-hidden rounded-control border border-ink-100 bg-ink-50"
          />
        ) : (
          <span
            key={`${line.product_name}-${index}`}
            className="grid size-12 shrink-0 place-items-center rounded-control bg-ink-50 text-ink-400"
          >
            <Package className="size-6" />
          </span>
        ),
      )}
      {more > 0 && (
        <span className="grid size-12 shrink-0 place-items-center rounded-control bg-ink-100 text-sm font-bold text-ink-700">
          {`+${formatNumber(more)}`}
        </span>
      )}
    </div>
  )
}
