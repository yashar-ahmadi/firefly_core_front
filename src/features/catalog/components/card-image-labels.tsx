import type { CardProduct } from '@/features/catalog/card-product'
import { badgeColors } from './badge-colors'
import { CARD_IMAGE_OVERLAY } from './card-styles'
import { DiscountTimer } from './discount-timer'

/**
 * What a card shows on its image: «ناموجود» over a veil, the operator's badge (bottom-start) and
 * the timed-deal pill (bottom-end). Placed after the name in the DOM and positioned over the
 * image, so screen readers meet the name first. Being on the image, the pill adds no row: every
 * card keeps the skeleton's height. When both don't fit the badge yields: it truncates down to
 * 4.5rem, then moves to its own line above the pill; the pill never shrinks.
 */
export function CardImageLabels({
  product,
  unavailable,
}: {
  product: CardProduct
  unavailable: boolean
}) {
  const dealEndsAt = product.has_discount ? product.discount_time_remaining : null
  if (!unavailable && !product.badge && dealEndsAt === null) return null

  return (
    <div className={CARD_IMAGE_OVERLAY}>
      {unavailable && (
        <span className="absolute inset-0 grid place-items-center rounded-control bg-white/60">
          <span className="rounded-pill bg-ink-800 px-3 py-0.5 text-sm font-bold text-white">
            ناموجود
          </span>
        </span>
      )}
      {(product.badge || dealEndsAt !== null) && (
        <div className="absolute inset-x-2 bottom-2 flex flex-wrap items-end gap-1">
          {product.badge && (
            <span
              className="block h-6 max-w-max min-w-0 grow basis-18 truncate rounded-pill px-2.5 text-sm leading-6 font-medium"
              style={badgeColors(product.badge)}
            >
              {product.badge.name}
            </span>
          )}
          {dealEndsAt !== null && <DiscountTimer endsAt={dealEndsAt} className="ms-auto" />}
        </div>
      )}
    </div>
  )
}
