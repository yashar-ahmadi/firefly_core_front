import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getStoreConfig } from '@/config/store-config'
import { CompareView } from '@/features/compare/compare-view'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'

const TITLE = 'مقایسه کالاها'
const PATH = '/compare/'
const HEADING_ID = 'compare-heading'

/** A page of this visitor's own choices: never indexed (its links may be followed). */
export async function generateMetadata(): Promise<Metadata> {
  return {
    ...seoMetadata({ path: PATH, noindex: true, siteName: await shopName() }),
    title: TITLE,
  }
}

/**
 * `/compare/` (spec §8.12): the products this device chose to compare, side by side. The list
 * lives in the browser (`ff-compare`), so the server renders the heading and a loading shell,
 * and CompareView reads the list and the products after hydration. 404 while the shop has
 * comparison switched off.
 */
export default function ComparePage() {
  if (!getStoreConfig().features.compare) notFound()
  return (
    <div className={cn(CONTAINER, 'flex flex-col gap-3 pt-2 pb-10 md:gap-4 md:pt-4 md:pb-14')}>
      <Breadcrumbs items={[{ name: TITLE }]} />
      <h1
        id={HEADING_ID}
        tabIndex={-1}
        className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        {TITLE}
      </h1>
      <CompareView headingId={HEADING_ID} />
    </div>
  )
}
