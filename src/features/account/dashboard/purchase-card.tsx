import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { Skeleton } from '@/components/ui/skeleton'
import { SmartImage } from '@/components/ui/smart-image'
import { CARD_NAME_BOX, CARD_SURFACE } from '@/features/catalog/components/card-styles'
import { productPath } from '@/features/catalog/listing-routes'
import type { PurchasedProduct } from '@/lib/api/types/dashboard'
import { formatJalaliDate } from '@/lib/format/date'

/** Two cards across on phones, four from md (the account column is at most ~1080px wide). */
const IMAGE_SIZES = '(min-width: 1024px) 260px, (min-width: 768px) 25vw, 50vw'

/** Under the name: «آخرین خرید» and the date, a line each (one line does not fit a phone's card). */
const META = 'flex h-12 flex-col px-0.5 text-sm leading-6'

/**
 * A purchased product, compact (the catalog card's surface, picture and name box): the name a
 * link stretched over the card, and «آخرین خرید» with its date (digest §3.5). No price, buttons or
 * client island: on the dashboard it is a way back to the product, not a shelf.
 */
export function PurchaseCard({ product }: { product: PurchasedProduct }) {
  const date = formatJalaliDate(product.last_purchased_at)
  return (
    <article
      className={cn(
        CARD_SURFACE,
        'gap-2',
        'group/card transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5',
      )}
    >
      <SmartImage
        src={product.image}
        alt=""
        ratio="1/1"
        skeleton
        sizes={IMAGE_SIZES}
        className="rounded-control bg-ink-50"
      />
      <h3
        dir="auto"
        className={cn(
          CARD_NAME_BOX,
          'line-clamp-2 px-0.5 text-base leading-7 font-medium text-ink-800',
        )}
      >
        <Link
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
      <p className={META}>
        <span className="text-ink-500">آخرین خرید</span>{' '}
        <time dateTime={product.last_purchased_at} className="truncate text-ink-700">
          {date}
        </time>
      </p>
    </article>
  )
}

/** Its skeleton: the same surface, a square picture, two name lines and the date line. */
export function PurchaseCardSkeleton() {
  return (
    <div data-testid="purchase-skeleton" aria-hidden className={cn(CARD_SURFACE, 'gap-2')}>
      <Skeleton className="aspect-square w-full rounded-control" />
      <span className={cn(CARD_NAME_BOX, 'flex flex-col justify-center gap-2.5 px-0.5')}>
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
      </span>
      <span className={cn(META, 'justify-around')}>
        <Skeleton className="h-3.5 w-1/3" />
        <Skeleton className="h-3.5 w-1/2" />
      </span>
    </div>
  )
}
