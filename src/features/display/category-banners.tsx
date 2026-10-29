import type { CategoryBanner } from '@/lib/api/types/display'
import { displayStyle } from './display-style'
import { PromoBanners } from './promo-banners'
import { toPromoItems } from './promo-item'

// A product or blog category's banners (product digest §4.2, blog digest §5: only on the
// category's detail): one banner is a single banner, several a group, both drawn in the
// category's `banner_style` with the homepage's banner styles (`PromoBanners`).

export interface CategoryBannersProps {
  /** The detail's `banners` (absent from an API older than category banners). */
  banners: CategoryBanner[] | undefined
  /** The detail's `banner_style`. */
  style: string | undefined
  /** The category's name: names the banners and a nameless linked one. */
  name: string
  className?: string
}

/**
 * The banners under the category's head, above its products or posts, in its style; nothing
 * when it has none. A banner with no link links nowhere; `mobile_image` null shows `image` on
 * phones too. The first loads first: on a category page it is usually the largest picture in
 * view.
 */
export function CategoryBanners({ banners, style, name, className }: CategoryBannersProps) {
  const items = toPromoItems(banners ?? [])
  if (items.length === 0) return null
  return (
    <section aria-label={`بنرهای ${name}`} data-style={displayStyle(style)} className={className}>
      <PromoBanners items={items} style={displayStyle(style)} label={name} priority />
    </section>
  )
}
