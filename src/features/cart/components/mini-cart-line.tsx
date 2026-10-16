'use client'

import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useId } from 'react'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { Price } from '@/components/ui/price'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { SmartImage } from '@/components/ui/smart-image'
import { productPath } from '@/features/catalog/listing-routes'
import type { CartLine } from '@/lib/api/types/cart'
import { formatNumber } from '@/lib/format'
import { lineLimits, useRemoveCartLine, useUpdateCartLine } from '../hooks'

const REMOVE = 'حذف از سبد خرید'
const UNAVAILABLE = 'این کالا در حال حاضر موجود نیست.'

/** Why the line cannot be ordered as it is (digest §5.4); the quantity is never auto-clamped. */
function lineWarning(line: CartLine): string | null {
  const unit = line.unit_name ?? 'عدد'
  switch (line.issue) {
    case 'unavailable':
      return UNAVAILABLE
    case 'insufficient_stock':
      return `موجودی کافی نیست؛ حداکثر ${formatNumber(line.available_quantity)} ${unit}.`
    case 'above_order_limit':
      return `بیشتر از سقف سفارش؛ حداکثر ${formatNumber(line.order_limit_max)} ${unit}.`
    case 'below_order_limit':
      return `کمتر از حداقل سفارش؛ حداقل ${formatNumber(line.order_limit_min)} ${unit}.`
    default:
      return line.in_stock ? null : UNAVAILABLE
  }
}

export interface MiniCartLineProps {
  line: CartLine
  onNavigate: () => void
  /** The bin was pressed: the line is on its way out (the list moves the focus once it is). */
  onRemoving?: () => void
  /** The removal was refused: the line stays. */
  onRemoveFailed?: () => void
}

/**
 * One line of the mini-cart: image, name and variant, a warning when it cannot be ordered, the
 * quantity stepper (bounded by the line's own limits, debounced) and the line total from the API,
 * dimmed while a change is on its way. The bin removes the line at once; the toast confirms it.
 * The stepper is locked while the line is being saved or removed.
 */
export function MiniCartLine({ line, onNavigate, onRemoving, onRemoveFailed }: MiniCartLineProps) {
  const nameId = useId()
  const href = productPath(line.product_slug)
  const quantity = useUpdateCartLine(line)
  const { remove, isPending: removing } = useRemoveCartLine()
  const { min, max } = lineLimits(line)
  const warning = lineWarning(line)

  return (
    <li aria-busy={quantity.isPending || removing || undefined} className="flex gap-3 py-4">
      {/* The name link below is the one tab stop; the image repeats it for pointers. */}
      <Link
        href={href}
        prefetch={false}
        tabIndex={-1}
        aria-hidden
        onClick={onNavigate}
        className="shrink-0 self-start"
      >
        <SmartImage
          src={line.image}
          alt=""
          ratio="1/1"
          sizes="72px"
          className="w-18 rounded-control bg-ink-50"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <h3 dir="auto" className="line-clamp-2 text-base leading-7 font-medium text-ink-900">
              <Link
                id={nameId}
                href={href}
                prefetch={false}
                onClick={onNavigate}
                data-line-name=""
                className="transition-colors hover:text-brand-700"
              >
                {line.product_name}
              </Link>
            </h3>
            {line.variant_name && (
              <p dir="auto" className="line-clamp-2 text-sm text-ink-600">
                {line.variant_name}
              </p>
            )}
          </div>
          <IconButton
            label={REMOVE}
            aria-describedby={nameId}
            icon={<Trash2 />}
            loading={removing}
            disabled={quantity.isSaving}
            onClick={async () => {
              quantity.cancel()
              onRemoving?.()
              if (!(await remove(line.variant_id))) onRemoveFailed?.()
            }}
            className="-me-2 -mt-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          />
        </div>

        {warning && <p className="text-sm text-danger">{warning}</p>}

        <div className="mt-1 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <QuantityStepper
            size="sm"
            value={quantity.quantity}
            min={min}
            max={max}
            onChange={quantity.setQuantity}
            loading={quantity.isSaving || removing}
          />
          <Price
            amount={line.line_total}
            original={line.line_discount > 0 ? line.line_subtotal : null}
            size="sm"
            className={cn('transition-opacity', quantity.isPending && 'opacity-50')}
          />
        </div>
      </div>
    </li>
  )
}
