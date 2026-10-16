import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getBrand, isPastLastPage } from '@/features/catalog/api'
import { ListingExtras } from '@/features/catalog/components/listing-extras'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { parseListingParams } from '@/features/catalog/listing-params'
import { BRANDS_PATH, brandPath, listingIndexing } from '@/features/catalog/listing-routes'
import { trailBreadcrumb, type TrailStep } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'
import { getTranslations } from '@/features/settings/api'
import { createTranslator } from '@/lib/i18n/translator'

interface BrandPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({
  params,
  searchParams,
}: BrandPageProps): Promise<Metadata> {
  const brand = await getBrand((await params).slug)
  if (brand === null) return notFoundMetadata()
  const sp = await searchParams
  if (await isPastLastPage(parseListingParams(sp, { context: { brand: brand.slug } }))) {
    return notFoundMetadata()
  }
  const path = brandPath(brand.slug)
  return seoMetadata({
    pageTitle: brand.page_title,
    description: brand.page_description,
    keywords: brand.page_keywords,
    image: isPlaceholderImage(brand.image) ? null : brand.image,
    // The logo is a 70×70 crop: too small for the large card.
    card: 'summary',
    path,
    siteName: await shopName(),
    ...listingIndexing(sp, { path, canonicalLink: brand.canonical_link }),
  })
}

/**
 * `/brand/<slug>/` (product digest §6.2): the logo and name, the brand's products (its filters
 * offer the root categories; attributes only once a category is chosen), then its content.
 * Status codes as the category page (R9): no loading.tsx, the brand awaited before rendering.
 *
 * The trail is home › «برندها» › brand. The backend's BreadcrumbList has no «برندها» step (home ›
 * brand), so the JSON-LD is built from the visible trail instead (`trailBreadcrumb`): both list
 * the same pages.
 */
export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const brand = await getBrand((await params).slug)
  if (brand === null) notFound()
  const t = createTranslator(await getTranslations())
  const trail: TrailStep[] = [
    { name: 'برندها', path: BRANDS_PATH },
    { name: brand.name, path: brandPath(brand.slug) },
  ]
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd data={trailBreadcrumb(trail, getStoreConfig().siteUrl, t('home'))} />
      <Breadcrumbs
        items={trail.map((step) => ({ name: step.name, href: step.path }))}
        className="mb-2"
      />
      <div className="mb-4 md:mb-6">
        <ListingHero
          title={brand.name}
          description={brand.description}
          image={{ src: brand.image, kind: 'logo' }}
        />
      </div>
      <ProductListing
        context={{ brand: brand.slug }}
        searchParams={searchParams}
        basePath={brandPath(brand.slug)}
      />
      <ListingExtras content={brand.content} />
    </div>
  )
}
