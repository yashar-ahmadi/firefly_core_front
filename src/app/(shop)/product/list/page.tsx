import type { Metadata } from 'next'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getListPage, isPastLastPage } from '@/features/catalog/api'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { parseListingParams } from '@/features/catalog/listing-params'
import { genericListingTitle, LISTING_PATH } from '@/features/catalog/listing-routes'
import { seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'

type SearchParams = Record<string, string | string[] | undefined>

interface ListingPageProps {
  searchParams: Promise<SearchParams>
}

/** The title from the query; a URL list is named by its page (the listing loads it anyway). */
async function listingTitle(sp: SearchParams): Promise<string> {
  const query = parseListingParams(sp)
  const list = query.list === undefined ? null : await getListPage(query.list)
  return genericListingTitle(query, list?.name)
}

export async function generateMetadata({ searchParams }: ListingPageProps): Promise<Metadata> {
  const sp = await searchParams
  if (await isPastLastPage(parseListingParams(sp))) return notFoundMetadata()
  return { ...seoMetadata({ path: LISTING_PATH, noindex: true }), title: await listingTitle(sp) }
}

/**
 * `/product/list/?…`, the generic listing (product digest §6.5): the whole store filtered by the
 * query (menu links, homepage «see all»). It has no SEO data of its own: the title is built from
 * the query, and it is `noindex, follow` with the bare path as canonical. No loading.tsx (R9):
 * a page past the last answers 404.
 */
export default async function ListingPage({ searchParams }: ListingPageProps) {
  const title = await listingTitle(await searchParams)
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <Breadcrumbs items={[{ name: title }]} className="mb-2" />
      <h1 className="mb-4 text-xl leading-9 font-bold text-ink-900 md:mb-6 md:text-2xl md:leading-10">
        {title}
      </h1>
      <ProductListing context={{}} searchParams={searchParams} basePath={LISTING_PATH} />
    </div>
  )
}
