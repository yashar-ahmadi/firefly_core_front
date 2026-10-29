import { displayStyle } from '@/features/display/display-style'
import { PromoSlider } from '@/features/display/promo-slider'
import { hasImage } from '@/features/home/promo-tile'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface SliderSectionProps {
  section: Extract<HomeSection, { type: 'slider' }>
  /** The page's first image section: its first slide is the LCP image. */
  priority: boolean
  seeAllLabel: string
}

/**
 * The hero slider (content.md §6.3) in the operator's style (`PromoSlider`: classic, peek, split
 * or thumbnails); no arrows, dots or thumbnails for one slide.
 */
export function SliderSection({ section, priority, seeAllLabel }: SliderSectionProps) {
  const items = section.items.filter(hasImage)
  if (items.length === 0) return null
  return (
    <SectionShell section={section} seeAllLabel={seeAllLabel} as="div">
      <PromoSlider
        items={items}
        style={displayStyle(section.style)}
        label={section.title.trim() || 'اسلایدر ویژه'}
        priority={priority}
      />
    </SectionShell>
  )
}
