import type { HomeSection } from '@/lib/api/types/catalog'

/**
 * Where a section's see-all link goes (content.md §6.1, §6.5): the operator's link wins (one
 * without a URL does nothing); otherwise a product carousel with a `listing_query` links to the
 * listing of that query, forwarded unchanged. null: no link. Pure.
 */
export function seeAllHref(section: HomeSection): string | null {
  const url = section.link?.url.trim()
  if (url) return url
  if (section.type === 'product_carousel' && section.listing_query) {
    return `/product/list/?${new URLSearchParams(section.listing_query)}`
  }
  return null
}
