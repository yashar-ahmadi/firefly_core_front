import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getCategory } from '@/features/catalog/api'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { assertDevOnly } from '../../dev-only'
import { PREVIEW_TITLE, PreviewFrame } from '../preview-frame'

export const metadata: Metadata = {
  title: 'پیش‌نمایش فهرست دسته',
  robots: { index: false, follow: false },
}

/**
 * Development only: the listing of one category (`/dev/listing/mobile-phone/`), with the
 * category's own slug as the context and its default sort, as the category page will do.
 */
export default async function CategoryListingPreviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ category: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  assertDevOnly()
  const category = await getCategory((await params).category)
  if (category === null) notFound()
  return (
    <PreviewFrame>
      <ProductListing
        context={{ category: category.slug }}
        searchParams={searchParams}
        basePath={`/dev/listing/${encodeURIComponent(category.slug)}/`}
        defaultSort={category.default_sorting ?? undefined}
        title={<h1 className={PREVIEW_TITLE}>{category.name}</h1>}
      />
    </PreviewFrame>
  )
}
