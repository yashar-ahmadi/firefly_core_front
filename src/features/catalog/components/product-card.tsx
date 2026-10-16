import Link from 'next/link'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/components/ui/cn'
import { Price } from '@/components/ui/price'
import { Rating } from '@/components/ui/rating'
import { SmartImage } from '@/components/ui/smart-image'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { CardProduct } from '@/features/catalog/card-product'
import { compareItemFrom } from '@/features/compare/compare-item'
import { CompareToggle } from '@/features/compare/compare-toggle'
import { HeartButton } from '@/features/wishlist/heart-button'
import {
  CARD_BODY,
  CARD_IMAGE_OVERLAY,
  CARD_NAME_BOX,
  CARD_PRICE_BOX,
  CARD_SURFACE,
  REVEAL_ON_HOVER,
} from './card-styles'
import { DiscountTimer } from './discount-timer'
import { QuickViewButton } from './quick-view-button'

/** The representative variant's labels shown as chips. */
const MAX_CHIPS = 2

/** Grid widths: 2 columns on phones, 3 from md, 4 from lg, 5 from 2xl (at most 1440px wide). */
const IMAGE_SIZES =
  '(min-width: 1536px) 270px, (min-width: 1024px) 25vw, (min-width: 768px) 33vw, 50vw'

export interface ProductCardProps {
  /** A list-API card (or a recently-viewed copy of one): everything shown comes from it. */
  product: CardProduct
  /** The image is above the fold (the first cards of a page): load it eagerly, first. */
  priority?: boolean
  /** The shop's setting: mark out-of-stock products with «ناموجود» and mute their price. */
  showOutOfStockLabel: boolean
  /** Opens quick view; the button shows only when given (a Client Component parent). */
  onQuickView?: (slug: string) => void
  /** The add-to-cart control, placed under the price above the card link. */
  addSlot?: ReactNode
}

/**
 * The product card. An `<article>` whose name link stretches over the whole card (its
 * `::after`), so the card is one tab stop and one click target; the heart, compare, quick view
 * and add buttons sit above that link as siblings, never inside it. Server-renderable: only those
 * buttons, the image and the countdown are client leaves.
 */
export function ProductCard({
  product,
  priority = false,
  showOutOfStockLabel,
  onQuickView,
  addSlot,
}: ProductCardProps) {
  const unavailable = !product.in_stock && showOutOfStockLabel
  const chips = product.default_variant_attributes.slice(0, MAX_CHIPS)
  const timedDiscount = product.has_discount ? product.discount_time_remaining : null

  return (
    <article
      className={cn(
        CARD_SURFACE,
        'group/card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5',
      )}
    >
      <div className="relative">
        <SmartImage
          src={product.image}
          alt={product.name}
          ratio="1/1"
          skeleton
          sizes={IMAGE_SIZES}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className="rounded-control bg-ink-50"
          imgClassName="transition-transform duration-300 ease-out motion-safe:group-hover/card:scale-[1.03]"
        />
        {unavailable && (
          <span className="absolute inset-0 grid place-items-center rounded-control bg-white/60">
            <span className="rounded-pill bg-ink-800 px-3 py-0.5 text-sm font-bold text-white">
              ناموجود
            </span>
          </span>
        )}
        {product.badge && (
          <span
            className="absolute start-2 bottom-2 block h-6 max-w-[calc(100%-1rem)] truncate rounded-pill px-2.5 text-sm leading-6 font-medium"
            style={{ backgroundColor: product.badge.badge_color, color: product.badge.text_color }}
          >
            {product.badge.name}
          </span>
        )}
      </div>

      <div className={CARD_BODY}>
        <h3
          dir="auto"
          className={cn(CARD_NAME_BOX, 'line-clamp-2 text-base leading-7 font-medium text-ink-800')}
        >
          <Link
            href={`/product/${encodeURIComponent(product.slug)}/`}
            prefetch={false}
            className={cn(
              "after:absolute after:inset-0 after:rounded-card after:content-['']",
              'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-(--focus) focus-visible:after:outline-solid',
            )}
          >
            {product.name}
          </Link>
        </h3>

        <div className="flex h-6 flex-wrap gap-1 overflow-hidden">
          {chips.map((chip) => (
            <Badge key={`${chip.attribute_name}:${chip.name}`} size="sm" className="max-w-full">
              <VisuallyHidden>{`${chip.attribute_name}: `}</VisuallyHidden>
              <span dir="auto" className="truncate">
                {chip.name}
              </span>
            </Badge>
          ))}
        </div>

        <div className="flex h-6 items-center">
          {product.rating > 0 ? (
            <Rating value={product.rating} count={product.rating_count} size="sm" compact />
          ) : (
            <span className="text-sm text-ink-500">بدون امتیاز</span>
          )}
        </div>

        {timedDiscount !== null && <DiscountTimer endsAt={timedDiscount} />}

        <div className={CARD_PRICE_BOX}>
          <Price
            amount={product.final_price}
            original={product.has_discount ? product.price : null}
            discountPercent={product.has_discount ? product.discount_percent : undefined}
            size="sm"
            muted={unavailable}
          />
        </div>

        {/* Over the image, but after the name in the DOM: tab and reading order is the link,
            then these buttons, then the add button. */}
        <div className={CARD_IMAGE_OVERLAY}>
          <div className="pointer-events-auto absolute start-0 top-0">
            <HeartButton productId={product.id} slug={product.slug} className={REVEAL_ON_HOVER} />
          </div>
          <div className="pointer-events-auto absolute end-0 top-0 flex flex-col">
            <CompareToggle item={compareItemFrom(product)} className={REVEAL_ON_HOVER} />
            {onQuickView && (
              <QuickViewButton
                slug={product.slug}
                onQuickView={onQuickView}
                className={REVEAL_ON_HOVER}
              />
            )}
          </div>
        </div>

        {addSlot && <div className="relative z-[1] mt-1">{addSlot}</div>}
      </div>
    </article>
  )
}
