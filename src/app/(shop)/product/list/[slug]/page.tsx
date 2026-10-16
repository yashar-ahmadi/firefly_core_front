import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getListPage, isPastLastPage } from '@/features/catalog/api'
import { ListingExtras } from '@/features/catalog/components/listing-extras'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { parseListingParams, withDefaultSort } from '@/features/catalog/listing-params'
import { listingIndexing, listPagePath } from '@/features/catalog/listing-routes'
import { breadcrumbTrail, siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'

interface ListPageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export async function generateMetadata({ params, searchParams }: ListPageProps): Promise<Metadata> {
  const list = await getListPage((await params).slug)
  if (list === null) return notFoundMetadata()
  const sp = await searchParams
  const query = parseListingParams(sp, { context: { list: list.slug } })
  if (await isPastLastPage(withDefaultSort(query, list.default_sorting ?? undefined))) {
    return notFoundMetadata()
  }
  const path = listPagePath(list.slug)
  return seoMetadata({
    pageTitle: list.page_title,
    description: list.page_description,
    keywords: list.page_keywords,
    path,
    siteName: await shopName(),
    ...listingIndexing(sp, { path, canonicalLink: list.canonical_link }),
  })
}

/**
 * `/product/list/<slug>/`, a curated landing page (product digest §6.6): its name and
 * description, its products in its default sort (its filters: the list's category options,
 * brands and attributes), then its content and FAQ. It has no `breadcrumb` array: the visible
 * trail comes from its BreadcrumbList. Status codes as the category page (R9).
 */
export default async function ListPage({ params, searchParams }: ListPageProps) {
  const list = await getListPage((await params).slug)
  if (list === null) notFound()
  const trail = breadcrumbTrail(list.breadcrumb_structured_data)
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd data={siteBreadcrumb(list.breadcrumb_structured_data, getStoreConfig().siteUrl)} />
      <Breadcrumbs items={trail.length > 0 ? trail : [{ name: list.name }]} className="mb-2" />
      <div className="mb-4 md:mb-6">
        <ListingHero title={list.name} description={list.description} />
      </div>
      <ProductListing
        context={{ list: list.slug }}
        searchParams={searchParams}
        basePath={listPagePath(list.slug)}
        defaultSort={list.default_sorting ?? undefined}
      />
      <ListingExtras content={list.content} questions={list.question_answers} />
    </div>
  )
}
