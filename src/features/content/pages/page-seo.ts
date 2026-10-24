import type { Metadata } from 'next'
import { contentPagePath } from '@/features/content/pages/page-routes'
import { trailBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { canonicalFor } from '@/features/seo/canonical'
import { pageMetadata } from '@/features/seo/page-metadata'
import { webPageJsonLd } from '@/features/seo/web-page-json-ld'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'
import type { PageDetail } from '@/lib/api/types/page'

// A content page's <head> and structured data (content digest §3.2, seo digest §7.1). Pure.

/**
 * The page's title, absolute (Plan 2's rule for a backend `page_title`): as the operator wrote
 * it when it names the shop already (an SEO title such as «درباره ما | فایرفلای»), else with the
 * layout's « | <shop>» added. The API's `page_title` is never empty but falls back to the page's
 * bare title (no shop name: checked on the dev backend), which on its own would title the tab
 * «درباره ما» alone.
 */
export function contentPageTitle(page: Pick<PageDetail, 'page_title' | 'title'>, shop: string) {
  const title = page.page_title.trim() || page.title.trim()
  return title.includes(shop) ? title : `${title} | ${shop}`
}

/**
 * The page's head (`pageMetadata`: keys without a value left out, never `undefined`):
 * - title: `contentPageTitle`;
 * - description: `page_description`, else `description`, else none (the layout's stays);
 * - keywords only when set;
 * - canonical (and `og:url`): `canonical_link`, else the page's own `/page/<slug>/`;
 * - Open Graph `website` and Twitter, unless the operator wrote that field as a meta row;
 * - the operator's `name=` meta rows through `other` (repeats kept, in order); the `property=`
 *   ones (`og:`, `article:`…) the page renders itself (`propertyMetaTags`);
 * - a staff preview of a draft: `noindex, nofollow`.
 */
export function contentPageMetadata(page: PageDetail, shop: string, siteUrl: string): Metadata {
  return pageMetadata({
    title: contentPageTitle(page, shop),
    description: page.page_description || page.description,
    keywords: page.page_keywords,
    canonical: canonicalFor(page.canonical_link, contentPagePath(page.slug), siteUrl),
    siteName: shop,
    card: 'summary',
    metaTags: page.meta_tags,
    robots: page.is_unpublished ? { index: false, follow: false } : null,
  })
}

/** The operator's «about us» page's slug: an AboutPage. */
const ABOUT_SLUG = 'about-us'

/**
 * The page's JSON-LD (seo digest §7.1: the API gives pages neither `structured_data` nor a
 * breadcrumb): the page's own node, a WebPage (an AboutPage for `about-us`) with its title, URL,
 * description (as the head's) and language, then the visible trail, «خانه» then the page, on the
 * storefront's origin. Written escaped by `JsonLd`.
 */
export function contentPageJsonLd(
  page: PageDetail,
  siteUrl: string,
): [object, BreadcrumbListJsonLd] {
  const path = contentPagePath(page.slug)
  return [
    webPageJsonLd({
      type: page.slug === ABOUT_SLUG ? 'AboutPage' : 'WebPage',
      name: page.title,
      path,
      description: page.page_description || page.description,
      siteUrl,
    }),
    trailBreadcrumb([{ name: page.title, path }], siteUrl, 'خانه'),
  ]
}
