import { ChevronLeft } from 'lucide-react'
import type { ReactNode } from 'react'
import { MenuIcon } from '@/components/layout/menu-link'
import { Carousel } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { SmartImage } from '@/components/ui/smart-image'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlockItem } from '@/lib/api/types/page'
import { toPersianDigits } from '@/lib/format'
import { StoreLink } from '@/lib/links/store-link'
import { text } from './blocks'

// The `cards` block (content digest §2): a card per item, its icon or picture (whichever it has),
// title, text and link, in one of four styles.

/** A card's link label when the operator wrote none. */
const MORE = 'بیشتر بدانید'

export interface CardsBlockProps {
  items: PageBlockItem[]
  style: DisplayStyle
  /** Names the carousel (style 3). */
  label: string
}

/** The icon in a soft round badge; nothing without one. */
function IconBadge({ icon, className }: { icon: string; className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-brand-50 ring-1 ring-brand-100',
        className,
      )}
    >
      <MenuIcon src={icon} className="size-7" />
    </span>
  )
}

/** The whole card as the item's link (its label shown at the foot), or the card alone. */
function Linked({ item, children }: { item: PageBlockItem; children: ReactNode }) {
  const url = text(item.link?.url)
  if (!url) return children
  return (
    <StoreLink href={url} className="group block h-full rounded-card">
      {children}
    </StoreLink>
  )
}

function MoreLabel({ item }: { item: PageBlockItem }) {
  if (!text(item.link?.url)) return null
  return (
    <span className="mt-auto inline-flex items-center gap-1 pt-2 text-sm font-medium text-brand-700">
      {text(item.link?.title) || MORE}
      <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
    </span>
  )
}

const SURFACE =
  'flex h-full flex-col overflow-hidden rounded-card bg-white shadow-card transition-[box-shadow,transform] duration-200 group-hover:shadow-raised motion-safe:group-hover:-translate-y-0.5'

/** Style 1 (and 3's slides): the icon centred on top (or the picture across it), then the words. */
function StackedCard({ item }: { item: PageBlockItem }) {
  const icon = text(item.icon)
  const image = icon ? '' : text(item.image)
  return (
    <Linked item={item}>
      <article className={SURFACE}>
        {image && (
          <SmartImage
            src={image}
            alt={text(item.alt)}
            ratio="16/9"
            sizes="(min-width: 1024px) 400px, 90vw"
            loading="lazy"
            className="bg-ink-100"
          />
        )}
        <div className={cn('flex flex-1 flex-col gap-2 p-5', !image && 'items-center text-center')}>
          {icon && <IconBadge icon={icon} className="mb-1 size-14" />}
          <h3 className="text-lg leading-8 font-bold text-ink-900 transition-colors group-hover:text-brand-700">
            {item.title}
          </h3>
          {text(item.description) && (
            <p className="text-base leading-7 whitespace-pre-line text-ink-600">
              {item.description}
            </p>
          )}
          <MoreLabel item={item} />
        </div>
      </article>
    </Linked>
  )
}

/** Style 2: the icon (or a small picture) beside the words. */
function RowCard({ item }: { item: PageBlockItem }) {
  const icon = text(item.icon)
  const image = icon ? '' : text(item.image)
  return (
    <Linked item={item}>
      <article className={cn(SURFACE, 'flex-row items-start gap-4 p-4 md:p-5')}>
        {icon && <IconBadge icon={icon} className="size-12" />}
        {image && (
          <SmartImage
            src={image}
            alt={text(item.alt)}
            ratio="1/1"
            sizes="64px"
            loading="lazy"
            className="size-16 shrink-0 rounded-control bg-ink-100"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h3 className="text-base leading-7 font-bold text-ink-900 transition-colors group-hover:text-brand-700">
            {item.title}
          </h3>
          {text(item.description) && (
            <p className="text-sm leading-6 whitespace-pre-line text-ink-600">{item.description}</p>
          )}
          <MoreLabel item={item} />
        </div>
      </article>
    </Linked>
  )
}

/**
 * Columns that keep rows even in the room the page gives: 2 and 4 cards in twos (4 in fours when
 * wide), 3 and 6 in threes, any other count in threes that wrap.
 */
function gridOf(count: number): string {
  if (count === 1) return 'grid gap-4'
  if (count === 2) return 'grid gap-4 @xl:grid-cols-2'
  if (count === 4) return 'grid gap-4 @xl:grid-cols-2 @5xl:grid-cols-4'
  return 'grid gap-4 @xl:grid-cols-2 @2xl:grid-cols-3'
}

/** Style 2's compact cards: threes for 3 and 6 when wide, else twos. */
function rowGridOf(count: number): string {
  if (count === 1) return 'grid gap-3'
  if (count % 3 === 0) return 'grid gap-3 @2xl:grid-cols-2 @4xl:grid-cols-3'
  return 'grid gap-3 @2xl:grid-cols-2'
}

/**
 * Style 4, steps: the cards as numbered steps joined by a line (down the page when narrow,
 * across it from 48rem of room), for a process («مراحل خرید»). The number replaces the icon.
 */
function Steps({ items }: { items: PageBlockItem[] }) {
  return (
    <ol className="grid gap-6 @3xl:auto-cols-fr @3xl:grid-flow-col @3xl:gap-4">
      {items.map((item, index) => {
        const last = index === items.length - 1
        return (
          <li
            key={item.id}
            className={cn(
              'relative flex gap-4 @3xl:flex-col @3xl:items-center @3xl:text-center',
              // The joining line: down to the next step, or across to it.
              !last &&
                "before:absolute before:start-6 before:top-14 before:-bottom-6 before:w-0.5 before:bg-brand-200 before:content-[''] @3xl:before:start-[calc(50%+2rem)] @3xl:before:-end-[calc(50%-2rem)] @3xl:before:top-6 @3xl:before:bottom-auto @3xl:before:h-0.5 @3xl:before:w-auto",
            )}
          >
            <span
              aria-hidden
              className="relative z-[1] grid size-12 shrink-0 place-items-center rounded-full bg-brand text-lg font-bold text-brand-fg shadow-sm ring-4 ring-white"
            >
              {toPersianDigits(index + 1)}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1 pt-2 @3xl:pt-0">
              <h3 className="text-base leading-7 font-bold text-ink-900">
                {text(item.link?.url) ? (
                  <StoreLink
                    href={text(item.link?.url)}
                    className="rounded-sm transition-colors hover:text-brand-700"
                  >
                    {item.title}
                  </StoreLink>
                ) : (
                  item.title
                )}
              </h3>
              {text(item.description) && (
                <p className="text-sm leading-6 whitespace-pre-line text-ink-600">
                  {item.description}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

/**
 * The cards in one of four styles: 1. cards with the icon centred on top (or a picture across
 * it), in even columns; 2. compact cards, the icon beside the words; 3. style 1's cards in a
 * carousel; 4. numbered steps. A card with a link is that link as a whole.
 */
export function CardsBlock({ items, style, label }: CardsBlockProps) {
  if (style === 'style_4') return <Steps items={items} />
  if (style === 'style_3') {
    return (
      <Carousel ariaLabel={label} slidesPerView={{ base: 1.15, md: 2.2, lg: 3 }} arrowGutters>
        {items.map((item) => (
          <StackedCard key={item.id} item={item} />
        ))}
      </Carousel>
    )
  }
  const Card = style === 'style_2' ? RowCard : StackedCard
  return (
    <ul className={style === 'style_2' ? rowGridOf(items.length) : gridOf(items.length)}>
      {items.map((item) => (
        <li key={item.id} className="min-w-0">
          <Card item={item} />
        </li>
      ))}
    </ul>
  )
}
