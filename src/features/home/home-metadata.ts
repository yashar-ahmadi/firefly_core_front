import type { Metadata } from 'next'
import { homeTitle } from '@/app/_shell/metadata'
import type { HomePage, MetaTag } from '@/lib/api/types/catalog'

// The home page's metadata from the homepage SEO fields (content.md §6.9). Pure. Keys without a
// value are left out, never set to `undefined` (that would wipe the layout's value).

/** Meta fields written with `property=` (Open Graph and its families); the rest use `name=`. */
const PROPERTY_FIELD = /^(?:og|article|product|profile|book|fb):/i

function usable(tag: MetaTag): boolean {
  return tag.field.trim() !== '' && tag.value.trim() !== ''
}

/**
 * The operator's `property=` meta tags, in order (two `og:image` rows stay two). Next's
 * `metadata.other` can only write `name=`, so the page renders these itself (React hoists them
 * into <head>).
 */
export function propertyMetaTags(tags: readonly MetaTag[]): MetaTag[] {
  return tags.filter((tag) => usable(tag) && PROPERTY_FIELD.test(tag.field.trim()))
}

/** The other rows by field, repeats kept in order (`metadata.other` takes arrays). */
function nameMetaTags(tags: readonly MetaTag[]): Record<string, string[]> {
  const other: Record<string, string[]> = {}
  for (const tag of tags) {
    if (!usable(tag) || PROPERTY_FIELD.test(tag.field.trim())) continue
    const field = tag.field.trim()
    other[field] = [...(other[field] ?? []), tag.value]
  }
  return other
}

/** Copies `entries` whose value is set and whose meta field the operator did not write. */
function ours(
  entries: [key: string, field: string, value: string | null][],
  given: ReadonlySet<string>,
): Record<string, string> {
  return Object.fromEntries(
    entries
      .filter(([, field, value]) => value !== null && !given.has(field))
      .map(([key, , value]) => [key, value as string]),
  )
}

export interface HomeShop {
  /** The shop's name (settings, else the preset label). */
  name: string
  slogan: string | null
}

/**
 * - title: `page_title` as is (it usually names the shop already), else «name | slogan» like the
 *   layout's default; always absolute, so the layout's «… | name» template is not added.
 * - description, keywords: when set; else the layout's description (the slogan) stays.
 * - canonical: `canonical_link`, else `/`.
 * - Open Graph and Twitter titles and descriptions are set explicitly; a field the operator
 *   wrote as a meta tag (og:title, twitter:card…) is theirs and left out here.
 * - other operator meta tags: `name=` ones through `other`; see `propertyMetaTags` for the rest.
 */
export function buildHomeMetadata(home: HomePage, shop: HomeShop): Metadata {
  const slogan = shop.slogan?.trim() || null
  const title = home.page_title.trim() || homeTitle(shop.name, slogan)
  const pageDescription = home.page_description.trim() || null
  const description = pageDescription ?? slogan
  const keywords = home.page_keywords.trim()
  const canonical = home.canonical_link?.trim() || '/'
  const given = new Set(home.meta_tags.filter(usable).map((tag) => tag.field.trim().toLowerCase()))
  const other = nameMetaTags(home.meta_tags)

  return {
    title: { absolute: title },
    ...(pageDescription ? { description: pageDescription } : {}),
    ...(keywords ? { keywords } : {}),
    alternates: { canonical },
    openGraph: ours(
      [
        ['type', 'og:type', 'website'],
        ['url', 'og:url', canonical],
        ['siteName', 'og:site_name', shop.name],
        ['locale', 'og:locale', 'fa_IR'],
        ['title', 'og:title', title],
        ['description', 'og:description', description],
      ],
      given,
    ),
    twitter: ours(
      [
        ['card', 'twitter:card', 'summary'],
        ['title', 'twitter:title', title],
        ['description', 'twitter:description', description],
      ],
      given,
    ),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  }
}
