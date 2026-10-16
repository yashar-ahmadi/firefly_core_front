import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'

// The <head> of a catalog page (category, brand, curated list, listings) from the backend's SEO
// fields (product digest §5.11). Pure.

export interface SeoInput {
  /** The backend's `page_title`: written as is (it often names the shop already). */
  pageTitle?: string
  /** `page_description`; "" means unset. */
  description?: string
  /** `page_keywords`; "" means unset. */
  keywords?: string
  /** The operator's `canonical_link`, or a canonical of the caller's; else `path`. */
  canonical?: string | null
  /** The page's own path, with its trailing slash. */
  path: string
  /** For the social cards; a placeholder is no picture to share (pass null). */
  image?: string | null
  /** `robots: noindex, follow` (a filtered or sorted listing, the generic listing). */
  noindex?: boolean
  /** The shop's name for `og:site_name` (`shopName()`), as on the home page. */
  siteName?: string | null
  /** The Twitter card; by default the large one with an image, else `summary`. */
  card?: 'summary' | 'summary_large_image'
}

/**
 * - title: `{ absolute: pageTitle }` when set, so the layout's «… | shop» template is not added
 *   twice; else no title (the caller's own or the layout's applies, and Next copies it to the
 *   social cards).
 * - description and keywords: only when set, never as `undefined` (that wipes the layout's).
 * - canonical (and `og:url`): `canonical`, else `path`.
 * - Open Graph `website` in `fa_IR` with the image and the shop's name; Twitter `card`, else
 *   `summary_large_image` when there is an image and `summary` without one.
 */
export function seoMetadata(input: SeoInput): Metadata {
  const image = input.image?.trim() || null
  return pageMetadata({
    title: input.pageTitle ?? null,
    description: input.description,
    keywords: input.keywords,
    canonical: input.canonical?.trim() || input.path,
    image,
    siteName: input.siteName,
    card: input.card ?? (image ? 'summary_large_image' : 'summary'),
    robots: input.noindex ? { index: false, follow: true } : null,
  })
}
