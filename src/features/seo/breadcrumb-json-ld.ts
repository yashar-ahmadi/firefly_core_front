import type { BreadcrumbItem } from '@/components/layout/breadcrumbs'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'

// The backend's BreadcrumbList (category, brand, list page) points at `https://<SITE_DOMAIN>`,
// which may differ from the storefront's own URL (seo digest §7.2). Pure.

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** The list with every item on `siteUrl`'s origin (path, query and hash kept). A new object. */
export function siteBreadcrumb(data: BreadcrumbListJsonLd, siteUrl: string): BreadcrumbListJsonLd {
  const origin = new URL(siteUrl).origin
  return {
    ...data,
    itemListElement: data.itemListElement.map((entry) => {
      const url = httpUrl(entry.item)
      return url ? { ...entry, item: `${origin}${url.pathname}${url.search}${url.hash}` } : entry
    }),
  }
}

/**
 * The visible trail from the list, linked by path, without the home item (the trail draws its
 * own home icon): for a page with no `breadcrumb` array (the curated list page).
 */
export function breadcrumbTrail(data: BreadcrumbListJsonLd): BreadcrumbItem[] {
  return [...data.itemListElement]
    .sort((a, b) => a.position - b.position)
    .flatMap((entry) => {
      const url = httpUrl(entry.item)
      if (url?.pathname === '/') return []
      return [
        url ? { name: entry.name, href: `${url.pathname}${url.search}` } : { name: entry.name },
      ]
    })
}
