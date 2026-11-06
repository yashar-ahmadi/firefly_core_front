import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'

// The BreadcrumbList of a page the API writes none for (or one without a step the page shows).
// The API's own lists (product, category, list page, blog) are embedded as they come: their items
// are on `STOREFRONT_URL`, each the page's `<loc>` in the sitemap (M-12). Pure.

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
