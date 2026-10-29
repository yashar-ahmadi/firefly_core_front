import { displayStyle } from '@/features/display/display-style'
import { PromoBanners } from '@/features/display/promo-banners'
import { hasImage } from '@/features/home/promo-tile'
import type { HomeSection } from '@/lib/api/types/catalog'
import { SectionShell } from './section-header'

export interface BannerGroupSectionProps {
  section: Extract<HomeSection, { type: 'banner_group' }>
  /** The page's first image section: its first banner is the LCP image. */
  priority: boolean
  seeAllLabel: string
}

/**
 * A group of banners (content.md §6.4) in the operator's style (`PromoBanners`: the grid laid
 * out by their count, a carousel, cards or a mosaic).
 */
export function BannerGroupSection({ section, priority, seeAllLabel }: BannerGroupSectionProps) {
  const items = section.items.filter(hasImage)
  if (items.length === 0) return null
  const style = displayStyle(section.style)
  return (
    <SectionShell
      section={section}
      seeAllLabel={seeAllLabel}
      as={style === 'style_2' && items.length > 1 ? 'div' : 'section'}
    >
      <PromoBanners
        items={items}
        style={style}
        label={section.title.trim() || 'بنر تبلیغاتی'}
        priority={priority}
      />
    </SectionShell>
  )
}
