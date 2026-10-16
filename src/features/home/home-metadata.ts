import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'
import type { HomePage } from '@/lib/api/types/catalog'
import { homeTitle } from '@/lib/seo/title'

// The home page's metadata from the homepage SEO fields (content.md §6.9). Pure.

export interface HomeShop {
  /** The shop's name (settings, else the preset label). */
  name: string
  slogan: string | null
}

/**
 * - title: `page_title` as is (it usually names the shop already), else «name | slogan» like the
 *   layout's default; always absolute, so the layout's «… | name» template is not added.
 * - description, keywords: an operator meta row of that name, else the SEO field, when set;
 *   else the layout's description (the slogan) stays, and the social cards repeat it.
 * - canonical: `canonical_link`, else `/`.
 * - the operator's other meta rows, and the merge rules: see `pageMetadata`.
 */
export function buildHomeMetadata(home: HomePage, shop: HomeShop): Metadata {
  const slogan = shop.slogan?.trim() || null
  return pageMetadata({
    title: home.page_title.trim() || homeTitle(shop.name, slogan),
    description: home.page_description,
    socialDescription: slogan,
    keywords: home.page_keywords,
    canonical: home.canonical_link?.trim() || '/',
    siteName: shop.name,
    card: 'summary',
    metaTags: home.meta_tags,
  })
}
