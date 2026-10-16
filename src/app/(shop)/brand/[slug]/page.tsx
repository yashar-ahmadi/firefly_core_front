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
import { siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

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
    path,
    ...listingIndexing(sp, { path, canonicalLink: brand.canonical_link }),
  })
}

/**
 * `/brand/<slug>/` (product digest §6.2): the logo and name, the brand's products (its filters
 * offer the root categories; attributes only once a category is chosen), then its content.
 * Status codes as the category page (R9): no loading.tsx, the brand awaited before rendering.
 */
export default async function BrandPage({ params, searchParams }: BrandPageProps) {
  const brand = await getBrand((await params).slug)
  if (brand === null) notFound()
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd data={siteBreadcrumb(brand.breadcrumb_structured_data, getStoreConfig().siteUrl)} />
      <Breadcrumbs
        items={[{ name: 'برندها', href: BRANDS_PATH }, { name: brand.name }]}
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
