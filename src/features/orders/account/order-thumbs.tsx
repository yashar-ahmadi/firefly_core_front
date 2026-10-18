import { Package } from 'lucide-react'
import { SmartImage } from '@/components/ui/smart-image'
import type { OrderLinePreview } from '@/lib/api/types/order-detail'

// An order card's pictures (order digest §6.3): the first lines the list gives (`item_preview`,
// three at most), each 48px and square. No «+n»: the preview carries no quantity and the list no
// line count (`item_count` counts units), so nothing tells how many lines are not shown; the
// card says the units in words. Pictures are decoration.

const SHOWN = 3

export function OrderThumbs({ preview }: { preview: OrderLinePreview[] }) {
  const shown = preview.slice(0, SHOWN)
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
    </div>
  )
}
