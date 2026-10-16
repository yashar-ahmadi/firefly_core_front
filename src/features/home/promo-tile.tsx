import { ChevronLeft } from 'lucide-react'
import type { CSSProperties } from 'react'
import { cn } from '@/components/ui/cn'
import type { HomeItem } from '@/lib/api/types/catalog'
import { StoreLink } from '@/lib/links/store-link'
import { PromoImage } from './promo-image'
import { promoTone, SCRIM, scrimColor } from './promo-tone'

export type PromoSize = 'hero' | 'tile'

/** A slide or banner with a picture to show (the panel requires one; a blank one is skipped). */
export function hasImage(item: HomeItem): boolean {
  return item.image.trim() !== ''
}

interface TextStyle {
  /** The scrim box (padding, `--fade`) and how the words and the button sit in it. */
  box: string
  words: string
  title: string
  description: string
  cta: string
}

const TEXT: Record<PromoSize, TextStyle> = {
  // Words above the button. Clear of the carousel arrows (8–52px from the edges) from `sm` up.
  hero: {
    box: 'flex-col items-start gap-1 px-4 pb-3 [--fade:2rem] sm:px-16 sm:pb-6 md:gap-2 md:[--fade:3.5rem]',
    words: 'gap-0.5 md:gap-1.5',
    title:
      'line-clamp-1 text-lg leading-7 md:line-clamp-2 md:text-2xl md:leading-10 lg:text-3xl lg:leading-[3rem]',
    description:
      'line-clamp-1 text-sm leading-6 md:line-clamp-2 md:text-base md:leading-7 lg:text-lg lg:leading-8',
    cta: 'h-8 px-3 text-sm md:h-10 md:px-4 md:text-base',
  },
  // The button beside the words, so the scrim stays low on a small banner.
  tile: {
    box: 'items-end justify-between gap-3 px-4 pb-3 [--fade:2rem] md:px-5 md:pb-4',
    words: '',
    title: 'line-clamp-1 text-base leading-7 md:text-lg md:leading-8',
    description: 'line-clamp-1 text-sm leading-6',
    cta: 'h-8 px-3 text-sm',
  },
}

/**
 * Title, description and button over the bottom of the picture. Under the words a scrim is
 * solid where they are and fades out above them (`--fade`, the top padding), so they reach AA on
 * any picture (see promoTone). A button alone needs none: it carries its own fill. The
 * operator's colour applies to the title and description only; the button is the shop's.
 */
function PromoText({ item, size, cta }: { item: HomeItem; size: PromoSize; cta: string }) {
  const tone = promoTone(item.text_color)
  const scrim = scrimColor(SCRIM[tone.scrim])
  const text = TEXT[size]
  const title = item.title.trim()
  const description = item.description.trim()
  const words = title !== '' || description !== ''
  const style: CSSProperties | undefined = words
    ? {
        backgroundImage: `linear-gradient(to top, ${scrim}, ${scrim} calc(100% - var(--fade)), transparent)`,
      }
    : undefined
  return (
    <div
      data-scrim={words ? tone.scrim : undefined}
      className={cn('absolute inset-x-0 bottom-0 flex pt-(--fade)', text.box)}
      style={style}
    >
      {words && (
        <div className={cn('flex max-w-2xl min-w-0 flex-col', text.words)}>
          {title && (
            <p className={cn('font-bold', text.title)} style={{ color: tone.color }}>
              {item.title}
            </p>
          )}
          {description && (
            <p className={text.description} style={{ color: tone.color }}>
              {item.description}
            </p>
          )}
        </div>
      )}
      {cta && (
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 rounded-pill bg-brand font-medium text-brand-fg shadow-sm transition-colors group-hover:bg-brand-700',
            text.cta,
          )}
        >
          {cta}
          <ChevronLeft aria-hidden className="size-4 ltr:rotate-180" />
        </span>
      )}
    </div>
  )
}

export interface PromoTileProps {
  item: HomeItem
  size: PromoSize
  /** Aspect ratio and background of the frame (it never depends on the picture). */
  frameClassName: string
  sizes: string
  priority?: boolean
  fit?: 'cover' | 'contain'
  /** The link's name when the item has no alt text and no text at all. */
  fallbackLabel: string
}

/**
 * A slide or banner (content.md §6.3–6.4): the picture in a fixed-ratio frame, so nothing
 * shifts while it loads, with the operator's text over it. With a link the whole tile is the
 * link and `link.title` is its button; without one it is not clickable.
 */
export function PromoTile({
  item,
  size,
  frameClassName,
  sizes,
  priority = false,
  fit = 'cover',
  fallbackLabel,
}: PromoTileProps) {
  const url = item.link?.url.trim() ?? ''
  const cta = url ? (item.link?.title.trim() ?? '') : ''
  const hasText = item.title.trim() !== '' || item.description.trim() !== '' || cta !== ''
  const tile = (
    <div className={cn('relative isolate overflow-hidden rounded-card', frameClassName)}>
      <PromoImage
        image={item.image}
        mobileImage={item.mobile_image?.trim() || null}
        alt={item.alt}
        sizes={sizes}
        priority={priority}
        fit={fit}
      />
      {hasText && <PromoText item={item} size={size} cta={cta} />}
    </div>
  )
  if (!url) return tile
  const nameless = !hasText && item.alt.trim() === ''
  return (
    <StoreLink
      href={url}
      className="group block rounded-card"
      aria-label={nameless ? fallbackLabel : undefined}
    >
      {tile}
    </StoreLink>
  )
}
