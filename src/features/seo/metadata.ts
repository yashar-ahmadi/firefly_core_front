import type { Metadata } from 'next'
import { pageMetadata } from '@/features/seo/page-metadata'
import { toPersianDigits } from '@/lib/format/digits'
import { htmlToText } from '@/lib/html/to-text'

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
  /**
   * Used when `description` is empty, instead of the layout's slogan: plain text such as
   * `metaExcerpt(category.short_description, category.description, category.content)`.
   */
  fallbackDescription?: string | null
  /**
   * No canonical (and no `og:url`): a noindex page that its query makes another URL than any
   * canonical would name (a filtered listing, a search). noindex with a canonical elsewhere is a
   * mixed signal.
   */
  noCanonical?: boolean
  /** An indexable later page (N > 1) of a listing: «صفحهٔ N» goes after the title. */
  page?: number
}

/** About what search engines show of a description. */
export const META_DESCRIPTION_LENGTH = 155

/**
 * The first candidate with text, as one plain line of at most about 155 characters, cut at a
 * word and ended with «…» when shortened. Candidates may hold HTML (a `content`): tags are
 * stripped and entities decoded. null when none has text.
 */
export function metaExcerpt(...candidates: (string | null | undefined)[]): string | null {
  for (const candidate of candidates) {
    const text = htmlToText(candidate)
    if (text === '') continue
    const chars = Array.from(text)
    if (chars.length <= META_DESCRIPTION_LENGTH) return text
    const cut = chars.slice(0, META_DESCRIPTION_LENGTH - 1).join('')
    const space = cut.lastIndexOf(' ')
    const word = space > META_DESCRIPTION_LENGTH * 0.6 ? cut.slice(0, space) : cut
    return `${word.replace(/[\s.،,:؛;]+$/u, '')}…`
  }
  return null
}

/** «… - صفحهٔ ۲» for a later page; the title as it is otherwise. */
function pagedTitle(title: string | undefined, page: number | undefined): string | null {
  if (!title?.trim()) return null
  return page !== undefined && page > 1 ? `${title.trim()} - صفحهٔ ${toPersianDigits(page)}` : title
}

/**
 * - title: `{ absolute: pageTitle }` when set, so the layout's «… | shop» template is not added
 *   twice, with «- صفحهٔ N» on a later page; else no title (the caller's own or the layout's
 *   applies, and Next copies it to the social cards).
 * - description: `description`, else `fallbackDescription` (never the layout's slogan for an
 *   entity page); keywords only when set. Never `undefined` keys (they wipe the layout's).
 * - canonical (and `og:url`): `canonical`, else `path`; none at all with `noCanonical`.
 * - Open Graph `website` in `fa_IR` with the image and the shop's name; Twitter `card`, else
 *   `summary_large_image` when there is an image and `summary` without one.
 */
export function seoMetadata(input: SeoInput): Metadata {
  const image = input.image?.trim() || null
  return pageMetadata({
    title: pagedTitle(input.pageTitle, input.page),
    description: input.description?.trim() || input.fallbackDescription,
    keywords: input.keywords,
    canonical: input.noCanonical ? null : input.canonical?.trim() || input.path,
    image,
    siteName: input.siteName,
    card: input.card ?? (image ? 'summary_large_image' : 'summary'),
    robots: input.noindex ? { index: false, follow: true } : null,
  })
}
