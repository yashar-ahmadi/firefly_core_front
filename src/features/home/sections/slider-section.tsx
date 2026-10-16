import { Carousel } from '@/components/ui/carousel'
import { hasImage, PromoTile } from '@/features/home/promo-tile'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

/** The slider rotates every 6 s (paused on hover, focus and touch; never under reduced motion). */
const AUTOPLAY_MS = 6000

/**
 * Frames: 16:9 on phones (the mobile image), 3:1 from md. Pictures are cropped to fill them, so
 * operators should upload about 1920×640 and 800×450 (or keep text away from the edges).
 */
const FRAME = 'aspect-video bg-linear-to-l from-brand-700 to-brand-500 md:aspect-[3/1]'

/** The container width: full width less the gutters, at most 1440px less 2 × 24px. */
const SIZES =
  '(min-width: 1440px) 1392px, (min-width: 1024px) calc(100vw - 3rem), calc(100vw - 2rem)'

export interface SliderSectionProps {
  section: Extract<HomeSection, { type: 'slider' }>
  /** The page's first image section: its first slide is the LCP image. */
  priority: boolean
  seeAllLabel: string
}

/** The hero slider (content.md §6.3): one slide in view, dots, no arrows or dots for one slide. */
export function SliderSection({ section, priority, seeAllLabel }: SliderSectionProps) {
  const items = section.items.filter(hasImage)
  if (items.length === 0) return null
  const label = section.title.trim() || 'اسلایدر ویژه'
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel} as="div">
      <Carousel ariaLabel={label} loop={items.length > 1} autoplayMs={AUTOPLAY_MS} showDots>
        {items.map((item, index) => (
          <PromoTile
            key={item.id}
            item={item}
            size="hero"
            frameClassName={FRAME}
            sizes={SIZES}
            priority={priority && index === 0}
            fallbackLabel={label}
          />
        ))}
      </Carousel>
    </SectionShell>
  )
}
