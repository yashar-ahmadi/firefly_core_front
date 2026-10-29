import { Quote } from 'lucide-react'
import { CategoryThumb } from '@/components/layout/category-thumb'
import { Carousel } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import type { DisplayStyle } from '@/features/display/display-style'
import type { PageBlockItem } from '@/lib/api/types/page'
import { text } from './blocks'

// The `testimonials` block (content digest §2): each item a customer's quote (`description`),
// name (`title`), role (`subtitle`) and portrait (`image`), as a figure with a blockquote, in one
// of four styles.

export interface TestimonialsBlockProps {
  items: PageBlockItem[]
  style: DisplayStyle
  /** Names the carousels (styles 1 and 3). */
  label: string
}

/** The spotlight (style 3) rotates every 8 s: a quote takes longer to read than a slide. */
const SPOTLIGHT_AUTOPLAY_MS = 8000

/** The reviewer's portrait, or the first letter of the name on the brand's tint. */
function Portrait({ item, className }: { item: PageBlockItem; className: string }) {
  return (
    <CategoryThumb
      category={{ name: text(item.title), image: text(item.image) }}
      sizes="64px"
      className={className}
    />
  )
}

/** Name and role under the quote. */
function Byline({ item, centred = false }: { item: PageBlockItem; centred?: boolean }) {
  const role = text(item.subtitle)
  return (
    <figcaption className={cn('flex items-center gap-3', centred && 'flex-col text-center')}>
      <Portrait item={item} className={cn('text-lg', centred ? 'size-16' : 'size-11')} />
      <span className="flex min-w-0 flex-col">
        <span className="text-base leading-7 font-bold text-ink-900">{item.title}</span>
        {role && <span className="text-sm leading-6 text-ink-600">{role}</span>}
      </span>
    </figcaption>
  )
}

/** A quote on a card: the mark, the words, then who said it. */
function QuoteCard({ item, className }: { item: PageBlockItem; className?: string }) {
  return (
    <figure
      className={cn(
        'flex h-full flex-col gap-4 rounded-card bg-white p-5 shadow-card md:p-6',
        className,
      )}
    >
      <Quote aria-hidden className="size-8 shrink-0 -scale-x-100 text-brand-300" />
      <blockquote className="flex-1 text-base leading-8 whitespace-pre-line text-ink-700">
        <p>{item.description}</p>
      </blockquote>
      <Byline item={item} />
    </figure>
  )
}

/** Style 3's slide: one quote large and centred on the brand's tint. */
function Spotlight({ item }: { item: PageBlockItem }) {
  return (
    <figure className="flex h-full flex-col items-center gap-5 rounded-card bg-linear-to-b from-brand-50 to-white px-5 py-8 text-center shadow-card ring-1 ring-brand-100 md:px-12 md:py-10">
      <Quote aria-hidden className="size-10 -scale-x-100 text-brand-400" />
      <blockquote className="max-w-2xl text-lg leading-9 whitespace-pre-line text-ink-800 md:text-xl md:leading-10">
        <p>{item.description}</p>
      </blockquote>
      <Byline item={item} centred />
    </figure>
  )
}

/**
 * The quotes in one of four styles: 1. a carousel of cards; 2. a grid of cards; 3. a spotlight,
 * one large quote at a time with dots; 4. cards in flowing columns (a wall), each as tall as its
 * words.
 */
export function TestimonialsBlock({ items, style, label }: TestimonialsBlockProps) {
  if (style === 'style_3') {
    return (
      <Carousel
        ariaLabel={label}
        loop={items.length > 1}
        autoplayMs={SPOTLIGHT_AUTOPLAY_MS}
        showDots
      >
        {items.map((item) => (
          <Spotlight key={item.id} item={item} />
        ))}
      </Carousel>
    )
  }
  if (style === 'style_2') {
    return (
      <ul className="grid gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
        {items.map((item) => (
          <li key={item.id} className="min-w-0">
            <QuoteCard item={item} />
          </li>
        ))}
      </ul>
    )
  }
  if (style === 'style_4') {
    return (
      <ul className="columns-1 gap-4 @2xl:columns-2 @5xl:columns-3">
        {items.map((item) => (
          <li key={item.id} className="mb-4 break-inside-avoid">
            <QuoteCard item={item} />
          </li>
        ))}
      </ul>
    )
  }
  return (
    <Carousel ariaLabel={label} slidesPerView={{ base: 1.1, md: 2, lg: 3 }} arrowGutters>
      {items.map((item) => (
        <QuoteCard key={item.id} item={item} />
      ))}
    </Carousel>
  )
}
