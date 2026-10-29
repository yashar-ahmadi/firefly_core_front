import { ChevronLeft } from 'lucide-react'
import { Carousel } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { PromoImage } from '@/features/home/promo-image'
import { hasImage, PromoTile } from '@/features/home/promo-tile'
import type { HomeItem } from '@/lib/api/types/catalog'
import { StoreLink } from '@/lib/links/store-link'
import type { DisplayStyle } from './display-style'

// Banners in the panel's four styles (content digest §6.4): the homepage's banner groups, a
// content page's `banners` block and a category's banners (product digest §4.2, blog digest §5)
// draw the same. Pictures are fitted whole, never cropped, since a banner's text is often part of
// its picture; one of another ratio is centred on a neutral band.

export type BannerLayout = '1' | '2' | '3' | '4' | 'many'

/** How a set of banners is laid out by its count: 1, 2, 3, 4, or 5 and more. */
export function bannerLayout(count: number): BannerLayout {
  return count > 4 ? 'many' : (String(Math.max(count, 1)) as BannerLayout)
}

/**
 * Style 1 and 3's grid: phones stack the banners; from md, 1 is full width, 2 sit side by side,
 * 3 in three columns, 4 in a 2×2 grid and 5 or more in three columns that wrap.
 */
const GRID = cn(
  'grid grid-cols-1 gap-3 sm:gap-4',
  'md:grid-cols-2 md:data-[count=1]:grid-cols-1 md:data-[count=3]:grid-cols-3 md:data-[count=many]:grid-cols-3',
)

/** 2:1 frames (a lone banner is 4:1 from md). */
const FRAME = {
  single: 'aspect-[2/1] bg-ink-100 md:aspect-[4/1]',
  multi: 'aspect-[2/1] bg-ink-100',
} as const

/** The rendered width of one banner, by how many share a row. */
const SIZES = {
  '1': '(min-width: 1440px) 1392px, (min-width: 1024px) calc(100vw - 3rem), calc(100vw - 2rem)',
  '2': '(min-width: 1440px) 688px, (min-width: 768px) 50vw, calc(100vw - 2rem)',
  '3': '(min-width: 1440px) 456px, (min-width: 768px) 33vw, calc(100vw - 2rem)',
} as const

function columnsOf(layout: BannerLayout): keyof typeof SIZES {
  if (layout === '1') return '1'
  return layout === '2' || layout === '4' ? '2' : '3'
}

/** Style 2: one and a bit banners on phones, two on tablets, three from lg. */
const CAROUSEL_PER_VIEW = { base: 1.15, md: 2, lg: 3 }

/** The words under a banner card whose link has no label of its own. */
const CARD_CTA = 'مشاهده'

export interface PromoBannersProps {
  items: HomeItem[]
  style: DisplayStyle
  /** Names a banner that links without any words (no alt, no title): the set's own name. */
  label: string
  /** The page's first image section: its first banner is the LCP image. */
  priority?: boolean
}

/**
 * A banner card (style 3): the picture, then the title, the description and the link's label on
 * the card under it, never over the picture; the whole card is the link. A banner with none of
 * these is its picture alone, on a card.
 */
function BannerCard({
  item,
  frame,
  sizes,
  priority,
  label,
}: {
  item: HomeItem
  frame: string
  sizes: string
  priority: boolean
  label: string
}) {
  const url = item.link?.url.trim() ?? ''
  const title = item.title.trim()
  const description = item.description.trim()
  const cta = url ? item.link?.title.trim() || CARD_CTA : ''
  const body = title !== '' || description !== ''
  const card = (
    <div className="flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card transition-shadow duration-200 group-hover:shadow-raised">
      <div className={cn('relative isolate', frame)}>
        <PromoImage
          image={item.image}
          mobileImage={item.mobile_image?.trim() || null}
          alt={item.alt}
          sizes={sizes}
          priority={priority}
          fit="contain"
        />
      </div>
      {(body || cta) && (
        <div className="flex flex-1 flex-col gap-1 p-4">
          {title && (
            <p className="line-clamp-2 text-base leading-7 font-bold text-ink-900 transition-colors group-hover:text-brand-700">
              {item.title}
            </p>
          )}
          {description && (
            <p className="line-clamp-2 text-sm leading-6 text-ink-600">{item.description}</p>
          )}
          {cta && (
            <span className="mt-auto inline-flex items-center gap-1 pt-1 text-sm font-medium text-brand-700">
              {cta}
              <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
            </span>
          )}
        </div>
      )}
    </div>
  )
  if (!url) return card
  return (
    <StoreLink
      href={url}
      className="group block h-full rounded-card"
      aria-label={!body && item.alt.trim() === '' ? label : undefined}
    >
      {card}
    </StoreLink>
  )
}

interface TileContext {
  priority: boolean
  label: string
}

function Tile({
  item,
  index,
  frame,
  sizes,
  context,
}: {
  item: HomeItem
  index: number
  frame: string
  sizes: string
  context: TileContext
}) {
  return (
    <PromoTile
      item={item}
      size="tile"
      frameClassName={frame}
      sizes={sizes}
      priority={context.priority && index === 0}
      fit="contain"
      fallbackLabel={context.label}
    />
  )
}

/** Style 1: the grid laid out by the count (`data-count`). */
function BannerGrid({ items, context }: { items: HomeItem[]; context: TileContext }) {
  const layout = bannerLayout(items.length)
  const sizes = SIZES[columnsOf(layout)]
  return (
    <div data-count={layout} className={GRID}>
      {items.map((item, index) => (
        <Tile
          key={item.id}
          item={item}
          index={index}
          frame={FRAME[layout === '1' ? 'single' : 'multi']}
          sizes={sizes}
          context={context}
        />
      ))}
    </div>
  )
}

/**
 * Style 4, the mosaic: the first banner large beside smaller ones, every picture kept at about
 * 2:1 (a large tile spans two columns and two rows of small 2:1 tiles). Three banners: the first
 * beside two stacked; five: the first beside a 2×2 of four. Two and four have no mosaic of equal
 * ratios, so they sit side by side or 2×2 as in style 1; past five, the rest follow as style 1's
 * grid. Phones: the first across the screen, then two by two.
 */
function BannerMosaic({ items, context }: { items: HomeItem[]; context: TileContext }) {
  if (items.length !== 3 && items.length < 5) return <BannerGrid items={items} context={context} />
  const head = items.slice(0, items.length === 3 ? 3 : 5)
  const rest = items.slice(head.length)
  const five = head.length === 5
  return (
    <div className="flex flex-col gap-3 sm:gap-4">
      <div
        data-mosaic={head.length}
        className={cn(
          'grid grid-cols-2 gap-3 sm:gap-4',
          five ? 'md:grid-cols-4' : 'md:grid-cols-3',
        )}
      >
        {head.map((item, index) => {
          const first = index === 0
          return (
            // A one-cell grid: the large tile's link stretches to the two rows it spans.
            <div
              key={item.id}
              className={cn(
                'grid min-w-0 grid-cols-[minmax(0,1fr)]',
                first && 'col-span-2 md:row-span-2',
              )}
            >
              <Tile
                item={item}
                index={index}
                frame={cn(
                  'bg-ink-100',
                  first ? 'aspect-[2/1] md:aspect-auto md:h-full' : 'aspect-[2/1]',
                )}
                sizes={
                  first
                    ? '(min-width: 1440px) 696px, (min-width: 768px) 50vw, calc(100vw - 2rem)'
                    : '(min-width: 1440px) 340px, (min-width: 768px) 25vw, 50vw'
                }
                context={context}
              />
            </div>
          )
        })}
      </div>
      {rest.length > 0 && <BannerGrid items={rest} context={{ ...context, priority: false }} />}
    </div>
  )
}

/**
 * The banners with a picture, in one of four styles; nothing when none has one:
 * 1. grid: laid out by their count, the words over each picture;
 * 2. carousel: a row that scrolls sideways, arrows beside it from sm;
 * 3. cards: style 1's grid, each banner a card with its words under the picture;
 * 4. mosaic: the first banner large beside smaller ones.
 * One banner is the same picture across the width in every style but the cards.
 */
export function PromoBanners({ items: all, style, label, priority = false }: PromoBannersProps) {
  const items = all.filter(hasImage)
  if (items.length === 0) return null
  const context = { priority, label }

  if (style === 'style_2' && items.length > 1) {
    return (
      <Carousel ariaLabel={label} slidesPerView={CAROUSEL_PER_VIEW} arrowGutters>
        {items.map((item, index) => (
          <Tile
            key={item.id}
            item={item}
            index={index}
            frame={FRAME.multi}
            sizes="(min-width: 1440px) 432px, (min-width: 1024px) 30vw, (min-width: 768px) 45vw, 85vw"
            context={context}
          />
        ))}
      </Carousel>
    )
  }

  if (style === 'style_3') {
    const layout = bannerLayout(items.length)
    return (
      <div data-count={layout} className={cn(GRID, 'items-stretch')}>
        {items.map((item, index) => (
          <BannerCard
            key={item.id}
            item={item}
            frame={FRAME[layout === '1' ? 'single' : 'multi']}
            sizes={SIZES[columnsOf(layout)]}
            priority={priority && index === 0}
            label={label}
          />
        ))}
      </div>
    )
  }

  if (style === 'style_4') return <BannerMosaic items={items} context={context} />
  return <BannerGrid items={items} context={context} />
}
