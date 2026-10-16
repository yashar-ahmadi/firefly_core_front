import type { BreadcrumbItem } from '@/components/layout/breadcrumbs'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'

// The backend's BreadcrumbList (category, brand, list page) points at `https://<SITE_DOMAIN>`,
// which may differ from the storefront's own URL (seo digest §7.2). Pure.

/** One step of a page's trail, at its storefront path (with its trailing slash). */
export interface TrailStep {
  name: string
  path: string
}

/**
 * A BreadcrumbList for the trail a page shows: «خانه» (`homeName`) at the root, then each step,
 * every item on `siteUrl`'s origin. For a page whose backend list leaves out a step the page
 * shows (the brand page's «برندها»), so the visible trail and the structured data agree.
 */
export function trailBreadcrumb(
  steps: readonly TrailStep[],
  siteUrl: string,
  homeName: string,
): BreadcrumbListJsonLd {
  const origin = new URL(siteUrl).origin
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [{ name: homeName, path: '/' }, ...steps].map((step, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: step.name,
      item: new URL(step.path, origin).href,
    })),
  }
}

function httpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:' ? url : null
  } catch {
    return null
  }
}

/** An http(s) URL moved onto `origin` (path, query and hash kept); anything else as it is. */
export function onSiteOrigin(value: string, origin: string): string {
  const url = httpUrl(value)
  return url ? `${origin}${url.pathname}${url.search}${url.hash}` : value
}

/** The list with every item on `siteUrl`'s origin (path, query and hash kept). A new object. */
export function siteBreadcrumb(data: BreadcrumbListJsonLd, siteUrl: string): BreadcrumbListJsonLd {
  const origin = new URL(siteUrl).origin
  return {
    ...data,
    itemListElement: data.itemListElement.map((entry) => ({
      ...entry,
      item: onSiteOrigin(entry.item, origin),
    })),
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
