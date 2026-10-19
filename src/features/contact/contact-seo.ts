import type { Metadata } from 'next'
import { CONTACT_US_PATH } from '@/features/content/pages/page-routes'
import { contentPageTitle } from '@/features/content/pages/page-seo'
import { trailBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { pageMetadata } from '@/features/seo/page-metadata'
import type { BreadcrumbListJsonLd } from '@/lib/api/types/catalog'
import type { PageDetail } from '@/lib/api/types/page'

// The contact page's <head> and structured data. Pure.

export const CONTACT_TITLE = 'تماس با ما'

/** The page's heading: the operator's `contact-us` page's title, else «تماس با ما». */
export function contactHeading(page: PageDetail | null): string {
  return page?.title.trim() || CONTACT_TITLE
}

/**
 * The contact page's head (`pageMetadata`: keys without a value left out): with the operator's
 * `contact-us` page, its title (`contentPageTitle`), description, keywords and `name=` meta rows
 * (its `property=` rows the page renders itself); without it, «تماس با ما» and a description of
 * our own. The canonical is always `/contact-us/`, the backend's `support_link` (seo digest
 * §2.2): the page's own `canonical_link` would name `/page/contact-us/`, which redirects here. A
 * staff preview of a draft is `noindex, nofollow`.
 */
export function contactMetadata(page: PageDetail | null, shop: string): Metadata {
  const fallback = `راه\u{200C}های تماس با ${shop}: تلفن، ایمیل، آدرس و فرم ارسال پیام.`
  return pageMetadata({
    title: page ? contentPageTitle(page, shop) : `${CONTACT_TITLE} | ${shop}`,
    description: page?.page_description || page?.description || fallback,
    keywords: page?.page_keywords,
    canonical: CONTACT_US_PATH,
    siteName: shop,
    card: 'summary',
    metaTags: page?.meta_tags ?? [],
    // A staff preview of a draft (`getContactPage`): never indexed.
    robots: page?.is_unpublished ? { index: false, follow: false } : null,
  })
}

/** The visible trail as JSON-LD: «خانه», then the contact page, on the storefront's origin. */
export function contactJsonLd(page: PageDetail | null, siteUrl: string): BreadcrumbListJsonLd {
  return trailBreadcrumb([{ name: contactHeading(page), path: CONTACT_US_PATH }], siteUrl, 'خانه')
}
