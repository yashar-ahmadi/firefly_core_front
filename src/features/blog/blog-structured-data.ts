import { BLOG_NAME } from '@/features/blog/blog-copy'
import { BLOG_PATH } from '@/features/blog/blog-routes'
import { onSiteOrigin, siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'

// The blog's structured data as the backend writes it (blog/services/structured_data.py: a post's
// BlogPosting, a category's CollectionPage, their BreadcrumbList), set right for the shop
// (seo digest §7.2). Pure:
// - every URL field moved from `https://{SITE_DOMAIN}` onto the storefront's origin, where
//   `/media/` is served too (the proxy forwards it, or the single-origin nginx serves it);
// - a URL field left empty dropped (a shop without a logo gets `publisher.logo.url: ""`, an
//   invalid URL), and a node it leaves naming nothing but its type (that logo's ImageObject);
// - the blog named as the shop names it, «وبلاگ» (BLOG_NAME, the visible trail's word): the
//   backend says «بلاگ» in the trail and in the Blog a category page is part of.

/** The structured data's URL fields: a page, a picture, a logo, a trail's item. */
const URL_KEYS = new Set(['url', 'item', '@id', 'image', 'logo'])
/** The backend's word for the blog, at the start of the Blog's name («بلاگ فایرفلای»). */
const BACKEND_BLOG_WORD = /^بلاگ(?=\s|$)/u

const isNode = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/** A node that names nothing but its type (and its context): it says nothing. */
const saysNothing = (value: unknown) =>
  isNode(value) && Object.keys(value).every((key) => key === '@type' || key === '@context')

/** `value` with every URL on `origin`, no empty URL field, the Blog named «وبلاگ». */
export function blogStructuredData(value: unknown, origin: string): unknown {
  if (Array.isArray(value)) return value.map((item) => blogStructuredData(item, origin))
  if (!isNode(value)) return value
  const node: Record<string, unknown> = {}
  for (const [key, item] of Object.entries(value)) {
    if (URL_KEYS.has(key) && typeof item === 'string') {
      if (item.trim() !== '') node[key] = onSiteOrigin(item, origin)
      continue
    }
    const set = blogStructuredData(item, origin)
    if (!saysNothing(set)) node[key] = set
  }
  if (node['@type'] === 'Blog' && typeof node.name === 'string') {
    node.name = node.name.replace(BACKEND_BLOG_WORD, BLOG_NAME)
  }
  return node
}

/** The trail on `siteUrl`'s origin, its step at `/blog/` named «وبلاگ». A new object. */
export function blogBreadcrumb(data: BreadcrumbListJsonLd, siteUrl: string): BreadcrumbListJsonLd {
  const list = siteBreadcrumb(data, siteUrl)
  return {
    ...list,
    itemListElement: list.itemListElement.map((entry) =>
      new URL(entry.item, siteUrl).pathname === BLOG_PATH ? { ...entry, name: BLOG_NAME } : entry,
    ),
  }
}
