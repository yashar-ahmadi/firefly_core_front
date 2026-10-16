import { ChevronLeft } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { listingHref, parseListingParams } from '@/features/catalog/listing-params'
import { LISTING_PATH } from '@/features/catalog/listing-routes'
import type { SearchGroup } from '@/lib/api/types/search'
import { formatNumber } from '@/lib/format'

export type ResultKind = 'products' | 'product_categories' | 'brands' | 'blog_posts' | 'pages'

/**
 * Where a group's «مشاهدهٔ همه» goes (content digest §7.1): only when the group has more than
 * it shows and a `listing_query`. Products go to the generic listing of that query, through
 * the listing helpers, so the parameters keep the API's names (`search`, `special_first`).
 * The other groups have no listing page in this storefront (the guide's `/search/categories/`
 * and friends are not planned), so they get none: their heading still says how many matched.
 */
export function seeAllHref(kind: ResultKind, group: SearchGroup<unknown>): string | null {
  if (group.listing_query === null || group.count <= group.items.length) return null
  if (kind !== 'products') return null
  return listingHref(LISTING_PATH, parseListingParams(group.listing_query))
}

/** One group of results: a heading with its count, «مشاهدهٔ همه» when there is more, the items. */
export function ResultGroup({
  kind,
  title,
  count,
  seeAll,
  children,
}: {
  kind: ResultKind
  title: string
  count: number
  seeAll: string | null
  children: ReactNode
}) {
  const headingId = `search-results-${kind}`
  return (
    <section aria-labelledby={headingId}>
      <div className="mb-3 flex min-h-11 items-center justify-between gap-3">
        <h2 id={headingId} className="text-lg leading-8 font-bold text-ink-900">
          {title}{' '}
          <span className="text-base font-medium text-ink-500">({formatNumber(count)})</span>
        </h2>
        {seeAll && (
          <Link
            href={seeAll}
            prefetch={false}
            aria-label={`مشاهده\u{0654} همه\u{0654} ${title}`}
            className={cn(buttonClasses({ variant: 'link' }), 'gap-1 text-base')}
          >
            {'مشاهده\u{0654} همه'}
            <ChevronLeft aria-hidden className="size-4" />
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

export interface CompactItem {
  key: number
  href: string
  name: string
  description?: string | null
  /** A decorative picture or icon before the name. */
  thumb: ReactNode
  /** Off for routes later plans build (blog posts, content pages): nothing to prefetch yet. */
  prefetch?: false
}

/** Categories, brands, posts and pages: a compact grid of linked rows. */
export function CompactList({ items }: { items: CompactItem[] }) {
  return (
    <ul className="grid gap-2 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
      {items.map((item) => (
        <li key={item.key} className="min-w-0">
          <Link
            href={item.href}
            prefetch={item.prefetch}
            className="flex min-h-16 items-center gap-3 rounded-card bg-white p-3 shadow-card transition-shadow duration-150 hover:shadow-raised"
          >
            {item.thumb}
            <span className="min-w-0 flex-1">
              <span className="line-clamp-2 text-base leading-7 font-medium text-ink-900">
                {item.name}
              </span>
              {item.description && (
                <span className="mt-0.5 line-clamp-2 text-sm leading-6 text-ink-600">
                  {item.description}
                </span>
              )}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}
