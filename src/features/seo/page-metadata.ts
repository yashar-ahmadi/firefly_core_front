import type { Metadata } from 'next'
import type { MetaTag } from '@/lib/api/types/catalog'

// A page's <head> from its SEO fields and the operator's meta rows (homepage, content pages).
// Pure. Keys without a value are left out, never set to `undefined` (that would wipe the
// layout's value).

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

/** `name=` fields Next writes from its own keys: an operator row for one replaces that key. */
const KEYED_FIELDS = new Set(['description', 'keywords'])

/** The first usable row for a `name=` field (case-insensitive), or null. */
function operatorValue(tags: readonly MetaTag[], field: string): string | null {
  const tag = tags.find((row) => usable(row) && row.field.trim().toLowerCase() === field)
  return tag ? tag.value.trim() : null
}

/**
 * The other `name=` rows by field, repeats kept in order (`metadata.other` takes arrays).
 * `description` and `keywords` are left out: they go to their own keys, so each tag is written
 * once.
 */
function nameMetaTags(tags: readonly MetaTag[]): Record<string, string[]> {
  const other: Record<string, string[]> = {}
  for (const tag of tags) {
    const field = tag.field.trim()
    if (!usable(tag) || PROPERTY_FIELD.test(field) || KEYED_FIELDS.has(field.toLowerCase())) {
      continue
    }
    other[field] = [...(other[field] ?? []), tag.value]
  }
  return other
}

/** Copies `entries` whose value is set and whose meta field the operator did not write. */
function ours(
  entries: [key: string, field: string, value: string | string[] | null][],
  given: ReadonlySet<string>,
): Record<string, string | string[]> {
  return Object.fromEntries(
    entries
      .filter(([, field, value]) => value !== null && !given.has(field))
      .map(([key, , value]) => [key, value as string | string[]]),
  )
}

/** Trimmed, or null when blank. */
function present(value: string | null | undefined): string | null {
  return value?.trim() || null
}

export interface PageSeo {
  /** Written as an absolute title; null leaves the layout's (or the caller's) title in force. */
  title: string | null
  description?: string | null
  /** The social cards' description when there is no `description` (the home page: the slogan). */
  socialDescription?: string | null
  keywords?: string | null
  /** A path (resolved against the layout's `metadataBase`) or an absolute URL. */
  canonical: string
  image?: string | null
  siteName?: string | null
  card: 'summary' | 'summary_large_image'
  robots?: { index: boolean; follow: boolean } | null
  /** The operator's meta rows: a field they wrote is theirs, and left out here. */
  metaTags?: readonly MetaTag[]
}

/**
 * - title: absolute (backend titles usually name the shop already), else none of ours.
 * - description, keywords: an operator meta row of that name, else the SEO field, when set.
 * - canonical and `og:url`: `canonical`.
 * - Open Graph (website, fa_IR) and Twitter: titles, descriptions and the image set explicitly;
 *   a field the operator wrote as a meta tag (og:title, twitter:card…) is left out here.
 * - other operator meta tags: `name=` ones through `other`; see `propertyMetaTags` for the rest.
 */
export function pageMetadata(seo: PageSeo): Metadata {
  const tags = seo.metaTags ?? []
  const title = present(seo.title)
  const description = operatorValue(tags, 'description') ?? present(seo.description)
  const social = description ?? present(seo.socialDescription)
  const keywords = operatorValue(tags, 'keywords') ?? present(seo.keywords)
  const image = present(seo.image)
  const images = image ? [image] : null
  const given = new Set(tags.filter(usable).map((tag) => tag.field.trim().toLowerCase()))
  const other = nameMetaTags(tags)

  return {
    ...(title ? { title: { absolute: title } } : {}),
    ...(description ? { description } : {}),
    ...(keywords ? { keywords } : {}),
    ...(seo.robots ? { robots: seo.robots } : {}),
    alternates: { canonical: seo.canonical },
    openGraph: ours(
      [
        ['type', 'og:type', 'website'],
        ['url', 'og:url', seo.canonical],
        ['siteName', 'og:site_name', present(seo.siteName)],
        ['locale', 'og:locale', 'fa_IR'],
        ['title', 'og:title', title],
        ['description', 'og:description', social],
        ['images', 'og:image', images],
      ],
      given,
    ),
    twitter: ours(
      [
        ['card', 'twitter:card', seo.card],
        ['title', 'twitter:title', title],
        ['description', 'twitter:description', social],
        ['images', 'twitter:image', images],
      ],
      given,
    ),
    ...(Object.keys(other).length > 0 ? { other } : {}),
  }
}
