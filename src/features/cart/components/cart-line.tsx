'use client'

import { Trash2 } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useId } from 'react'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { Price } from '@/components/ui/price'
import { QuantityStepper } from '@/components/ui/quantity-stepper'
import { SmartImage } from '@/components/ui/smart-image'
import { productPath } from '@/features/catalog/listing-routes'
import type { CartLine } from '@/lib/api/types/cart'
import { lineLimits, useUpdateCartLine } from '../hooks'
import { lineWarning } from '../line-warning'
import { useRemoveLineWithUndo } from '../remove-hooks'

const REMOVE = 'حذف از سبد خرید'

export interface CartLineItemProps {
  line: CartLine
  /** A change of this line is waiting or on its way (`true`), or settled (`false`). */
  onPendingChange?: (variant: number, pending: boolean) => void
  /** The bin was pressed: the line is on its way out (the page moves the focus once it is). */
  onRemoving?: () => void
  /** The removal was refused: the line stays. */
  onRemoveFailed?: () => void
  /** «بازگردانی» was pressed in the removal's toast (the page moves the focus). */
  onUndo?: (line: CartLine) => void
}

/**
 * One line of the cart page, as the API priced it: the image and the name (both to the product
 * page), the variant, the unit price (the struck list price only with an active discount), the
 * quantity stepper within the line's own limits (debounced; only the final, changed value is
 * sent), the bin, the line total (struck subtotal only with a discount) and why the line cannot
 * be ordered as it is. A change on its way dims the total and is reported (`onPendingChange`);
 * the bin is locked while the line's PUT is in flight, and drops a quantity still waiting. A
 * removal is undone from its toast («بازگردانی»).
 */
export function CartLineItem({
  line,
  onPendingChange,
  onRemoving,
  onRemoveFailed,
  onUndo,
}: CartLineItemProps) {
  const nameId = useId()
  const href = productPath(line.product_slug)
  const quantity = useUpdateCartLine(line)
  const { remove, isPending: removing } = useRemoveLineWithUndo({ onUndo })
  const { min, max } = lineLimits(line)
  const warning = lineWarning(line)
  const pending = quantity.isPending || removing

  const variant = line.variant_id
  useEffect(() => {
    onPendingChange?.(variant, pending)
  }, [onPendingChange, variant, pending])
  useEffect(() => () => onPendingChange?.(variant, false), [onPendingChange, variant])

  return (
    <li
      data-variant={line.variant_id}
      aria-busy={pending || undefined}
      className="flex gap-3 py-4 md:gap-4 md:py-5"
    >
      {/* The name link is the one tab stop; the image repeats it for pointers. */}
      <Link href={href} tabIndex={-1} aria-hidden className="shrink-0 self-start">
        <SmartImage
          src={line.image}
          alt=""
          ratio="1/1"
          sizes="(min-width: 48rem) 112px, 88px"
          className="w-22 rounded-control bg-ink-50 md:w-28"
        />
      </Link>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-start gap-1">
          <div className="min-w-0 flex-1">
            <h3 dir="auto" className="line-clamp-2 text-base leading-7 font-medium text-ink-900">
              <Link
                id={nameId}
                href={href}
                data-line-name=""
                className="transition-colors hover:text-brand-700"
              >
                {line.product_name}
              </Link>
            </h3>
            {line.variant_name && (
              <p dir="auto" className="line-clamp-2 text-sm leading-6 text-ink-600">
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
              if (!(await remove(line))) onRemoveFailed?.()
            }}
            className="-me-2 -mt-1.5 text-ink-500 hover:bg-danger/10 hover:text-danger"
          />
        </div>

        <div className="flex items-center gap-2 text-sm text-ink-600">
          <span>قیمت واحد:</span>
          <Price
            amount={line.unit_final_price}
            original={line.unit_discount > 0 ? line.unit_price : null}
            size="sm"
          />
        </div>

        {warning && <p className="text-sm leading-6 font-medium text-danger">{warning}</p>}

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
            className={cn('transition-opacity', quantity.isPending && 'opacity-50')}
          />
        </div>
      </div>
    </li>
  )
}
