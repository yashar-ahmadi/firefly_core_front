import Link from 'next/link'
import { useId, type ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/components/ui/cn'
import { Price } from '@/components/ui/price'
import { Rating } from '@/components/ui/rating'
import { SmartImage } from '@/components/ui/smart-image'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { CardProduct } from '@/features/catalog/card-product'
import { productPath } from '@/features/catalog/listing-routes'
import { compareItemFrom } from '@/features/compare/compare-item'
import { CardActions, type CardActionsProduct } from './card-actions'
import { CardImageLabels } from './card-image-labels'
import { CARD_BODY, CARD_NAME_BOX, CARD_PRICE_BOX, CARD_SURFACE } from './card-styles'

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
  /** The shop's add slot under the price: a one-tap add or the variant chooser (`cardActionKind`). */
  withAction?: boolean
  /**
   * Another control in the add slot (when not `withAction`). A function gets the id of the name
   * link, for its `aria-describedby`.
   */
  addSlot?: ReactNode | ((nameId: string) => ReactNode)
}

/** What the card's client island needs: nothing else of the card is sent to the browser twice. */
function actionsProduct(product: CardProduct): CardActionsProduct {
  const { id, slug, name, image, type, in_stock, default_variant_id, order_limit_min } = product
  return { id, slug, name, image, type, in_stock, default_variant_id, order_limit_min }
}

/**
 * The product card. An `<article>` whose name link stretches over the whole card (its
 * `::after`), so the card is one tab stop and one click target; the heart, compare, quick view
 * and add buttons sit above that link as siblings, never inside it. Labels on the image come
 * after the name in the DOM (read first), the buttons after the price (focused after the link).
 * Server-renderable: the buttons are one client island (CardActions, reading its grid's
 * CardScope), and the image and the countdown are client leaves.
 */
export function ProductCard({
  product,
  priority = false,
  showOutOfStockLabel,
  withAction = false,
  addSlot,
}: ProductCardProps) {
  const unavailable = !product.in_stock && showOutOfStockLabel
  const chips = product.default_variant_attributes.slice(0, MAX_CHIPS)
  // Names the card's buttons (aria-describedby): twenty «افزودن به مقایسه» need telling apart.
  const nameId = useId()
  const slot = withAction ? null : typeof addSlot === 'function' ? addSlot(nameId) : addSlot

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
          alt=""
          ratio="1/1"
          skeleton
          sizes={IMAGE_SIZES}
          loading={priority ? 'eager' : 'lazy'}
          fetchPriority={priority ? 'high' : undefined}
          className="rounded-control bg-ink-50"
          imgClassName="transition-transform duration-300 ease-out motion-safe:group-hover/card:scale-[1.03]"
        />
      </div>

      <div className={CARD_BODY}>
        <h3
          dir="auto"
          className={cn(CARD_NAME_BOX, 'line-clamp-2 text-base leading-7 font-medium text-ink-800')}
        >
          <Link
            id={nameId}
            href={productPath(product.slug)}
            prefetch={false}
            className={cn(
              "after:absolute after:inset-0 after:rounded-card after:content-['']",
              'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-(--focus) focus-visible:after:outline-solid',
            )}
          >
            {product.name}
          </Link>
        </h3>

        <CardImageLabels product={product} unavailable={unavailable} />

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

        <div className={CARD_PRICE_BOX}>
          <Price
            amount={product.final_price}
            original={product.has_discount ? product.price : null}
            discountPercent={product.has_discount ? product.discount_percent : undefined}
            size="sm"
            muted={unavailable}
          />
        </div>

        <CardActions
          product={actionsProduct(product)}
          compareItem={compareItemFrom(product)}
          nameId={nameId}
          withAction={withAction}
        />
        {slot && <div className="@container relative z-[1] mt-1">{slot}</div>}
      </div>
    </article>
  )
}
