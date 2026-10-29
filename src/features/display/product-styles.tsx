import { ChevronLeft, Sparkles } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { Price } from '@/components/ui/price'
import { SmartImage } from '@/components/ui/smart-image'
import type { CardProduct } from '@/features/catalog/card-product'
import { ProductRail } from '@/features/catalog/components/product-rail'
import { productPath } from '@/features/catalog/listing-routes'
import { toPersianDigits } from '@/lib/format'
import { StoreLink } from '@/lib/links/store-link'

// A product carousel's third and fourth styles (content digest §6.5): the «پیشنهاد شگفت‌انگیز»
// band and the ranked compact list. Styles 1 and 2 are the shop's own rail and grid.

export interface ProductBandProps {
  /** The heading's id (`aria-labelledby`); the title is the band's h2. */
  id: string
  title: string
  subtitle: string
  /** The see-all link and its label (the operator's, else the listing of its query). */
  link: { href: string; label: string } | null
  products: CardProduct[]
  showOutOfStockLabel: boolean
}

/**
 * Style 3, the «پیشنهاد شگفت‌انگیز» band: the cards on a band of the brand's own gradient, its
 * title, subtitle and a white «مشاهدهٔ همه» at the start (a column from lg, a row above the cards
 * below it). The words take the brand's text colour (`--brand-fg`, AA on brand 600 to 800, the
 * band's whole range); the cards keep their white surface. Made for the timed-discount source,
 * whose cards count down, it suits any carousel the operator wants to stand out.
 */
export function ProductBand({
  id,
  title,
  subtitle,
  link,
  products,
  showOutOfStockLabel,
}: ProductBandProps) {
  return (
    <section
      aria-labelledby={title ? id : undefined}
      aria-label={title ? undefined : 'پیشنهاد شگفت‌انگیز'}
      data-band=""
      className="min-w-0 overflow-hidden rounded-card bg-linear-to-l from-brand-600 via-brand-700 to-brand-800 p-3 shadow-card sm:p-4 lg:flex lg:items-stretch lg:gap-2"
    >
      <div className="flex items-center justify-between gap-3 px-1 pb-3 text-brand-fg lg:w-52 lg:shrink-0 lg:flex-col lg:items-start lg:justify-center lg:gap-5 lg:px-3 lg:pb-0 xl:w-60">
        <div className="flex min-w-0 items-center gap-3 lg:flex-col lg:items-start">
          <span
            aria-hidden
            className="grid size-11 shrink-0 place-items-center rounded-full bg-white/15 ring-1 ring-white/30 lg:size-14 [&_svg]:size-6 lg:[&_svg]:size-7"
          >
            <Sparkles />
          </span>
          <div className="min-w-0">
            {title && (
              <h2
                id={id}
                className="line-clamp-2 text-lg leading-8 font-bold md:text-xl md:leading-9 lg:text-2xl lg:leading-10"
              >
                {title}
              </h2>
            )}
            {subtitle && (
              <p className="line-clamp-2 text-sm leading-6 lg:mt-1 lg:text-base lg:leading-7">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {link && (
          <StoreLink
            href={link.href}
            className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-pill bg-white px-4 text-sm font-medium text-brand-800 shadow-sm transition-colors hover:bg-brand-50"
          >
            {link.label}
            <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
          </StoreLink>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <ProductRail
          products={products}
          ariaLabel={title || 'پیشنهاد شگفت‌انگیز'}
          showOutOfStockLabel={showOutOfStockLabel}
        />
      </div>
    </section>
  )
}

export interface ProductRankedListProps {
  products: CardProduct[]
  /** Names the list (the section's title). */
  label: string
  showOutOfStockLabel: boolean
}

/**
 * Style 4, the ranked compact list: each product a row of its rank, picture, name and price, in
 * columns of three rows that scroll sideways (one and a bit columns on phones, three from md,
 * four from lg), the order the operator's source gave (best sellers read as a top list). The
 * whole row is the product's link; there is no add button here.
 */
export function ProductRankedList({
  products,
  label,
  showOutOfStockLabel,
}: ProductRankedListProps) {
  return (
    <ol
      aria-label={label}
      className={cn(
        '-mx-4 grid snap-x snap-mandatory scroll-px-4 auto-cols-[min(20rem,85%)] grid-flow-col grid-rows-3 gap-x-3 gap-y-2 overflow-x-auto px-4 pt-1 pb-2',
        '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
        'sm:auto-cols-[calc((100%-0.75rem)/2)] md:mx-0 md:auto-cols-[calc((100%-1.5rem)/3)] md:px-0 lg:auto-cols-[calc((100%-2.25rem)/4)]',
      )}
    >
      {products.map((product, index) => {
        const unavailable = !product.in_stock && showOutOfStockLabel
        return (
          <li key={product.id} className="min-w-0 snap-start">
            <Link
              href={productPath(product.slug)}
              prefetch={false}
              className="group flex h-full items-center gap-3 rounded-card bg-white p-2.5 shadow-card ring-1 ring-transparent transition-[box-shadow] duration-150 hover:ring-brand-200"
            >
              <span
                aria-hidden
                className="w-8 shrink-0 text-center text-2xl leading-none font-black text-brand-700 tabular-nums"
              >
                {toPersianDigits(index + 1)}
              </span>
              <SmartImage
                src={product.image}
                alt=""
                ratio="1/1"
                sizes="72px"
                loading="lazy"
                className="size-18 shrink-0 rounded-control bg-ink-50"
              />
              <span className="flex min-w-0 flex-1 flex-col gap-1">
                <span
                  dir="auto"
                  className="line-clamp-2 text-sm leading-6 font-medium text-ink-800 transition-colors group-hover:text-brand-700"
                >
                  {product.name}
                </span>
                <Price
                  amount={product.final_price}
                  original={product.has_discount ? product.price : null}
                  discountPercent={product.has_discount ? product.discount_percent : undefined}
                  size="sm"
                  muted={unavailable}
                />
              </span>
            </Link>
          </li>
        )
      })}
    </ol>
  )
}
