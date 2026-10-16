import type { Metadata } from 'next'
import { ProductListing } from '@/features/catalog/components/listing/product-listing'
import { assertDevOnly } from '../dev-only'
import { PREVIEW_TITLE, PreviewFrame } from './preview-frame'

export const metadata: Metadata = {
  title: 'پیش‌نمایش فهرست کالاها',
  robots: { index: false, follow: false },
}

/** Development only: the listing with no route context, as the generic `/product/list/`. */
export default function ListingPreviewPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  assertDevOnly()
  return (
    <PreviewFrame>
      <ProductListing
        context={{}}
        searchParams={searchParams}
        basePath="/dev/listing/"
        title={<h1 className={PREVIEW_TITLE}>همهٔ محصولات</h1>}
      />
    </PreviewFrame>
  )
}
