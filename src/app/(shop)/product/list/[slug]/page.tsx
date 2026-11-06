import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getListPage, isPastLastPage } from '@/features/catalog/api'
import { ListingExtras } from '@/features/catalog/components/listing-extras'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { parseListingParams, withDefaultSort } from '@/features/catalog/listing-params'
import { categoryPath, listingIndexing, listPagePath } from '@/features/catalog/listing-routes'
import { JsonLd } from '@/features/seo/json-ld'
import { metaExcerpt, seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { OperatorMetaTags } from '@/features/seo/operator-meta-tags'
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
    fallbackDescription: metaExcerpt(list.description, list.content),
    keywords: list.page_keywords,
    path,
    siteName: await shopName(),
    metaTags: list.meta_tags,
    ...listingIndexing(sp, { path, canonicalLink: list.canonical_link }),
  })
}

/**
 * `/product/list/<slug>/`, a curated landing page (product digest §6.6): its name and
 * description, its products in its default sort (its filters: the list's category options,
 * brands and attributes), then its content and FAQ. The trail is its category's chain
 * (`product_category.breadcrumb`, J-16), then the page, as its BreadcrumbList has it. Status
 * codes as the category page (R9).
 */
export default async function ListPage({ params, searchParams }: ListPageProps) {
  const list = await getListPage((await params).slug)
  if (list === null) notFound()
  const chain = list.product_category?.breadcrumb ?? []
  const trail = [
    ...chain.map((node) => ({ name: node.name, href: categoryPath(node.path) })),
    { name: list.name },
  ]
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <OperatorMetaTags tags={list.meta_tags} />
      <JsonLd data={list.breadcrumb_structured_data} />
      <Breadcrumbs items={trail} className="mb-2" />
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
