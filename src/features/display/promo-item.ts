import type { HomeItem } from '@/lib/api/types/catalog'
import type { OperatorLink } from '@/lib/api/types/display'

// Slides and banners from anywhere, as the shared promo tiles draw them: a page block's items
// (content digest §2: null for keys a type does not read) and a category's banners (product and
// blog digests: "" for unset text) become the homepage's `HomeItem`. Pure.

/** A picture with optional text and link: a page block item or a category banner. */
export interface PromoSource {
  id: number
  title?: string | null
  description?: string | null
  image: string | null
  mobile_image?: string | null
  alt?: string | null
  text_color?: string | null
  link?: OperatorLink | null
}

const text = (value: string | null | undefined) => value ?? ''

/** A link with a URL, its title "" when unset; null when there is no URL to follow. */
function promoLink(link: OperatorLink | null | undefined): OperatorLink | null {
  const url = link?.url?.trim() ?? ''
  return url ? { url, title: text(link?.title) } : null
}

/** The item as a `HomeItem` (nulls as ""), or null when it has no picture to show. */
export function toPromoItem(source: PromoSource): HomeItem | null {
  const image = source.image?.trim() ?? ''
  if (!image) return null
  return {
    id: source.id,
    title: text(source.title),
    description: text(source.description),
    image,
    mobile_image: source.mobile_image?.trim() || null,
    text_color: text(source.text_color),
    alt: text(source.alt),
    link: promoLink(source.link),
  }
}

/** Every item with a picture, in order. */
export function toPromoItems(sources: readonly PromoSource[]): HomeItem[] {
  return sources.map(toPromoItem).filter((item): item is HomeItem => item !== null)
}
