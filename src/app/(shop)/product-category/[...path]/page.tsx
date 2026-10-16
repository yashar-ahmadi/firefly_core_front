import type { Metadata } from 'next'
import { notFound, permanentRedirect } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { isPlaceholderImage } from '@/components/layout/menu-tree'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { getCategory, getFilters, isPastLastPage } from '@/features/catalog/api'
import { ListingExtras } from '@/features/catalog/components/listing-extras'
import { ListingHero } from '@/features/catalog/components/listing-hero'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { SubcategoryChips } from '@/features/catalog/components/subcategory-chips'
import { parseListingParams, withDefaultSort } from '@/features/catalog/listing-params'
import {
  categoryPath,
  listingIndexing,
  queryString,
  requestedCategoryPath,
} from '@/features/catalog/listing-routes'
import { siteBreadcrumb } from '@/features/seo/breadcrumb-json-ld'
import { JsonLd } from '@/features/seo/json-ld'
import { metaExcerpt, seoMetadata } from '@/features/seo/metadata'
import { notFoundMetadata } from '@/features/seo/not-found-metadata'
import { shopName } from '@/features/seo/shop-name'

type SearchParams = Record<string, string | string[] | undefined>

interface CategoryPageProps {
  params: Promise<{ path: string[] }>
  searchParams: Promise<SearchParams>
}

/**
 * The category named by the URL's last segment, with the requested path in the API's decoded
 * form; null when a segment cannot be a slug or the API has no such (published) category.
 */
async function loadCategory(segments: string[]) {
  const requested = requestedCategoryPath(segments)
  if (requested === null) return null
  const category = await getCategory(segments.at(-1) ?? '')
  return category === null ? null : { category, requested }
}

export async function generateMetadata({
  params,
  searchParams,
}: CategoryPageProps): Promise<Metadata> {
  const loaded = await loadCategory((await params).path)
  if (loaded === null) return notFoundMetadata()
  const { category } = loaded
  const sp = await searchParams
  const query = parseListingParams(sp, { context: { category: category.slug } })
  if (await isPastLastPage(withDefaultSort(query, category.default_sorting ?? undefined))) {
    return notFoundMetadata()
  }
  const path = categoryPath(category.path)
  return seoMetadata({
    pageTitle: category.page_title,
    description: category.page_description,
    fallbackDescription: metaExcerpt(
      category.short_description,
      category.description,
      category.content,
    ),
    keywords: category.page_keywords,
    image: isPlaceholderImage(category.image) ? null : category.image,
    path,
    siteName: await shopName(),
    ...listingIndexing(sp, { path, canonicalLink: category.canonical_link }),
  })
}

/**
 * The subcategory links, from the category's filter metadata: the listing loads the same
 * filters, so this is no extra request (React cache), and it loads alongside the list.
 */
async function CategoryChips({ slug, path }: { slug: string; path: string }) {
  const filters = await getFilters({ category: slug })
  return <SubcategoryChips parentPath={path} options={filters?.categories ?? []} />
}

/**
 * `/product-category/<path>/` (product digest §6.1). The category is looked up by its own (last)
 * slug; a path that is not its `path` (moved, or shortened) answers 308 to the canonical one with
 * the query kept. Segments are compared decoded, so `/…/%D8%AF…/` and `/…/د…/` are the same page.
 *
 * Status codes (R9): no loading.tsx; the category is awaited and `notFound()` or the redirect
 * happen before anything renders, and the listing (outside any Suspense) answers 404 for a
 * page past the last. Other failures reach the error boundary.
 */
export default async function CategoryPage({ params, searchParams }: CategoryPageProps) {
  const loaded = await loadCategory((await params).path)
  if (loaded === null) notFound()
  const { category, requested } = loaded
  const path = categoryPath(category.path)
  if (requested !== category.path) permanentRedirect(`${path}${queryString(await searchParams)}`)

  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <JsonLd
        data={siteBreadcrumb(category.breadcrumb_structured_data, getStoreConfig().siteUrl)}
      />
      <Breadcrumbs
        items={category.breadcrumb.map((node) => ({
          name: node.name,
          href: categoryPath(node.path),
        }))}
        className="mb-2"
      />
      <div className="mb-4 md:mb-6">
        <ListingHero
          title={category.name}
          description={category.short_description}
          image={{ src: category.image, kind: 'category' }}
        >
          <CategoryChips slug={category.slug} path={category.path} />
        </ListingHero>
      </div>
      <ProductListing
        context={{ category: category.slug }}
        searchParams={searchParams}
        basePath={path}
        defaultSort={category.default_sorting ?? undefined}
      />
      <ListingExtras
        content={category.content}
        considerBeforeBuying={category.consider_before_buying}
        questions={category.question_answers}
      />
    </div>
  )
}
