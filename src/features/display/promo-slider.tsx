import { ChevronLeft } from 'lucide-react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Carousel } from '@/components/ui/carousel'
import { cn } from '@/components/ui/cn'
import { PromoImage } from '@/features/home/promo-image'
import { hasImage, PromoTile } from '@/features/home/promo-tile'
import type { HomeItem } from '@/lib/api/types/catalog'
import { StoreLink } from '@/lib/links/store-link'
import type { DisplayStyle } from './display-style'
import { ThumbnailSlider } from './thumbnail-slider'

// A slider in the panel's four styles (content digest §6.3; a page's `slider` block, §2): the
// homepage's hero and a content page's slider block draw the same.

/** Every style rotates every 6 s (paused on hover, focus and touch; never under reduced motion). */
const AUTOPLAY_MS = 6000

/** The container width: full width less the gutters, at most 1440px less 2 × 24px. */
export const SLIDER_SIZES =
  '(min-width: 1440px) 1392px, (min-width: 1024px) calc(100vw - 3rem), calc(100vw - 2rem)'

/**
 * Style 1's frames: 16:9 on phones (the mobile image), 3:1 from md. Pictures are cropped to fill
 * them, so operators should upload about 1920×640 and 800×450 (or keep text away from the edges).
 */
const CLASSIC_FRAME = 'aspect-video bg-linear-to-l from-brand-700 to-brand-500 md:aspect-[3/1]'

/** Style 2: a slide a little narrower than the track (5:2 from md), its neighbours peeking in. */
const PEEK_FRAME = 'aspect-video bg-linear-to-l from-brand-700 to-brand-500 md:aspect-[5/2]'
const PEEK_PER_VIEW = { base: 1.12, md: 1.18, lg: 1.25 }
/** A peeking slide's width in the container (`SLIDER_SIZES` over `PEEK_PER_VIEW`). */
const PEEK_SIZES =
  '(min-width: 1440px) 1114px, (min-width: 1024px) 80vw, (min-width: 768px) 85vw, 90vw'

/** Style 4: one slide in view, 16:9 on phones, 3:1 from md (as style 1), thumbnails under it. */
const THUMB_FRAME = CLASSIC_FRAME

/** The CTA of a split slide whose link has no label of its own. */
const SPLIT_CTA = 'مشاهده'

export interface PromoSliderProps {
  items: HomeItem[]
  style: DisplayStyle
  /** Names the slider (the section's title, else a generic name). */
  label: string
  /** The page's first image section: its first slide is the LCP image. */
  priority?: boolean
  /** The rendered width of a slide, for next/image (`SLIDER_SIZES`: the container). */
  sizes?: string
}

/**
 * One slide of style 3: the picture beside a panel with the title, the description and a button
 * (from md; stacked on phones). The words sit on the panel, not on the picture, so they take the
 * shop's colours (`text_color` is for words over a picture). The whole slide is the link. A slide
 * with no words and no link is its picture alone, as tall.
 */
function SplitSlide({
  item,
  sizes,
  priority,
  label,
}: {
  item: HomeItem
  sizes: string
  priority: boolean
  label: string
}) {
  const url = item.link?.url.trim() ?? ''
  const title = item.title.trim()
  const description = item.description.trim()
  const cta = url ? item.link?.title.trim() || SPLIT_CTA : ''
  const panel = title !== '' || description !== '' || cta !== ''
  const slide = (
    <div
      className={cn(
        'grid h-full overflow-hidden rounded-card bg-white shadow-card md:h-80 lg:h-96',
        panel && 'md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]',
      )}
    >
      <div className="relative isolate aspect-video bg-brand-100 md:aspect-auto md:h-full">
        <PromoImage
          image={item.image}
          mobileImage={item.mobile_image?.trim() || null}
          alt={item.alt}
          sizes={panel ? `(min-width: 768px) 60vw, ${sizes}` : sizes}
          priority={priority}
        />
      </div>
      {panel && (
        <div className="flex flex-col justify-center gap-3 bg-linear-to-br from-brand-50 to-white p-5 md:p-8 lg:p-10">
          {title && (
            <p className="line-clamp-2 text-xl leading-9 font-bold text-ink-900 md:text-2xl md:leading-10 lg:text-3xl lg:leading-[3rem]">
              {item.title}
            </p>
          )}
          {description && (
            <p className="line-clamp-3 text-base leading-7 text-ink-700 md:text-lg md:leading-8">
              {item.description}
            </p>
          )}
          {cta && (
            <span
              className={cn(
                buttonClasses({ size: 'md' }),
                'mt-1 self-start group-hover:bg-brand-700',
              )}
            >
              {cta}
              <ChevronLeft aria-hidden className="ltr:rotate-180" />
            </span>
          )}
        </div>
      )}
    </div>
  )
  if (!url) return slide
  return (
    <StoreLink
      href={url}
      className="group block h-full rounded-card"
      aria-label={!panel && item.alt.trim() === '' ? label : undefined}
    >
      {slide}
    </StoreLink>
  )
}

/**
 * The slides with a picture, in one of four styles; nothing when none has one:
 * 1. classic: one slide across the container, its words over the picture, dots;
 * 2. peek: the slide centred and a little narrower, the next and previous peeking in on both
 *    sides, dots;
 * 3. split: the picture beside a panel of words and a button (stacked on phones), dots;
 * 4. thumbnails: one slide, and under it a row of thumbnails to choose from (dots on phones).
 * One slide is never a carousel's worth of controls: no arrows, dots or thumbnails.
 */
export function PromoSlider({
  items: all,
  style,
  label,
  priority = false,
  sizes = SLIDER_SIZES,
}: PromoSliderProps) {
  const items = all.filter(hasImage)
  if (items.length === 0) return null
  const multi = items.length > 1

  if (style === 'style_3') {
    return (
      <Carousel ariaLabel={label} loop={multi} autoplayMs={AUTOPLAY_MS} showDots>
        {items.map((item, index) => (
          <SplitSlide
            key={item.id}
            item={item}
            sizes={sizes}
            priority={priority && index === 0}
            label={label}
          />
        ))}
      </Carousel>
    )
  }

  const tile = (item: HomeItem, index: number, frame: string, tileSizes: string) => (
    <PromoTile
      key={item.id}
      item={item}
      size="hero"
      frameClassName={frame}
      sizes={tileSizes}
      priority={priority && index === 0}
      fallbackLabel={label}
    />
  )

  if (style === 'style_2') {
    return (
      <Carousel
        ariaLabel={label}
        loop={multi}
        autoplayMs={AUTOPLAY_MS}
        showDots
        align="center"
        slidesPerView={multi ? PEEK_PER_VIEW : { base: 1 }}
      >
        {items.map((item, index) =>
          tile(
            item,
            index,
            cn(PEEK_FRAME, 'shadow-card'),
            multi && sizes === SLIDER_SIZES ? PEEK_SIZES : sizes,
          ),
        )}
      </Carousel>
    )
  }

  if (style === 'style_4' && multi) {
    return (
      <ThumbnailSlider
        ariaLabel={label}
        autoplayMs={AUTOPLAY_MS}
        thumbs={items.map(({ id, image, title }) => ({ id, image, title }))}
      >
        {items.map((item, index) => tile(item, index, THUMB_FRAME, sizes))}
      </ThumbnailSlider>
    )
  }

  return (
    <Carousel ariaLabel={label} loop={multi} autoplayMs={AUTOPLAY_MS} showDots>
      {items.map((item, index) => tile(item, index, CLASSIC_FRAME, sizes))}
    </Carousel>
  )
}
