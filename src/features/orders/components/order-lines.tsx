import { Package } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { SmartImage } from '@/components/ui/smart-image'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { productPath } from '@/features/catalog/listing-routes'
import { formatToman, toPersianDigits } from '@/lib/format'
import type { OrderLine } from '@/lib/api/types/order-detail'

// An order's lines (order digest §6.4): the picture, the name (a link to the product, unless its
// variant was deleted: `product_slug` null), the variant, the brand, the quantity in its unit,
// the unit's final price (the unit price struck through when discounted) and the line's total.
// Every amount is the API's own field: nothing is added or multiplied here. A slot per line for
// the page's action (the account's review button, Task 8). For the account's order page; tracking
// has no lines.

export interface OrderLinesProps {
  lines: OrderLine[]
  /** What the page offers for one line (e.g. «ثبت نظر»). */
  action?: (line: OrderLine) => ReactNode
}

function Thumb({ src }: { src: string | null }) {
  if (!src) {
    return (
      <span
        data-line-placeholder
        aria-hidden
        className="grid size-16 shrink-0 place-items-center rounded-control bg-ink-50 text-ink-400"
      >
        <Package className="size-7" />
      </span>
    )
  }
  return (
    <SmartImage
      src={src}
      alt=""
      ratio="1/1"
      sizes="64px"
      className="size-16 shrink-0 overflow-hidden rounded-control bg-ink-50"
    />
  )
}

export function OrderLines({ lines, action }: OrderLinesProps) {
  return (
    <ul aria-label="اقلام سفارش" className="flex flex-col divide-y divide-ink-100">
      {lines.map((line, index) => {
        const discounted = line.unit_discount > 0
        const quantity = `${toPersianDigits(line.quantity)} ${line.unit_name ?? 'عدد'}`
        return (
          <li
            key={`${line.sku ?? line.product_name}-${index}`}
            className="flex gap-3 py-4 first:pt-0 last:pb-0"
          >
            <Thumb src={line.image} />
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              {line.product_slug ? (
                <Link
                  href={productPath(line.product_slug)}
                  dir="auto"
                  className="text-base leading-7 font-medium text-ink-900 hover:text-brand-700 hover:underline"
                >
                  {line.product_name}
                </Link>
              ) : (
                <span dir="auto" className="text-base leading-7 font-medium text-ink-900">
                  {line.product_name}
                </span>
              )}
              {(line.variant_name || line.brand_name) && (
                <p className="text-sm leading-6 text-ink-600">
                  {[line.variant_name, line.brand_name].filter(Boolean).join(' · ')}
                </p>
              )}
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="flex flex-wrap items-baseline gap-x-2 text-sm leading-6 text-ink-700">
                  <span>{quantity}</span>
                  <span aria-hidden>×</span>
                  {discounted && (
                    <>
                      <VisuallyHidden>قیمت پیش از تخفیف:</VisuallyHidden>
                      <del className="text-ink-500">{formatToman(line.unit_price)}</del>
                      <VisuallyHidden>قیمت پس از تخفیف:</VisuallyHidden>
                    </>
                  )}
                  <span>{formatToman(line.unit_final_price)}</span>
                </p>
                <p className="text-base leading-7 font-bold text-ink-900">
                  {formatToman(line.line_total)}
                </p>
              </div>
              {action && <div className="pt-1">{action(line)}</div>}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
