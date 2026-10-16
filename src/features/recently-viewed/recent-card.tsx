import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import { CARD_SURFACE } from '@/features/catalog/components/card-styles'
import { productPath } from '@/features/catalog/listing-routes'
import type { RecentItem } from './store'

/** Two and a half cards on phones, four and a half on tablets, six from lg. */
const IMAGE_SIZES = '(min-width: 1024px) 190px, (min-width: 768px) 22vw, 40vw'

/**
 * A recently viewed product, compact: its picture and name, the name a link stretched over the
 * card. No price, stock or rating (spec ruling: kept on the device they would go stale; the
 * product page shows them fresh).
 */
export function RecentCard({ item }: { item: RecentItem }) {
  return (
    <article
      className={cn(
        CARD_SURFACE,
        'group/card gap-2 transition-[box-shadow,transform] duration-200 ease-out hover:shadow-raised motion-safe:hover:-translate-y-0.5',
      )}
    >
      <SmartImage
        src={item.image}
        alt=""
        ratio="1/1"
        skeleton
        sizes={IMAGE_SIZES}
        className="rounded-control bg-ink-50"
      />
      <h3
        dir="auto"
        className="line-clamp-2 min-h-14 px-0.5 text-base leading-7 font-medium text-ink-800"
      >
        <Link
          href={productPath(item.slug)}
          prefetch={false}
          className={cn(
            "after:absolute after:inset-0 after:rounded-card after:content-['']",
            'focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-offset-2 focus-visible:after:outline-(--focus) focus-visible:after:outline-solid',
          )}
        >
          {item.name}
        </Link>
      </h3>
    </article>
  )
}
