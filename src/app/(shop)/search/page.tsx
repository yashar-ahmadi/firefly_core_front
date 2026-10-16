import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Breadcrumbs } from '@/components/layout/breadcrumbs'
import { CONTAINER } from '@/components/layout/container'
import { cn } from '@/components/ui/cn'
import { getProductSettings } from '@/features/catalog/api'
import { searchCatalog } from '@/features/search/api'
import { normalizeQuery } from '@/features/search/query'
import { SearchResults } from '@/features/search/results/search-results'
import {
  NoResults,
  SearchRefused,
  SearchStart,
  SearchThrottled,
} from '@/features/search/results/search-states'
import { seoMetadata } from '@/features/seo/metadata'
import { shopName } from '@/features/seo/shop-name'
import { getCategoryTree } from '@/features/settings/api'
import { formatNumber } from '@/lib/format'

type SearchParams = Record<string, string | string[] | undefined>

interface SearchPageProps {
  searchParams: Promise<SearchParams>
}

const SEARCH_PATH = '/search/'
const TITLE = 'جستجو'

/**
 * `q` as typed, or null when it is missing or blank once normalised (spaces, ZWNJ, bidi marks):
 * then the search API is never called. next/form prefetches `/search/` from every page, and
 * every call to the API is logged in the operator's search report.
 */
function termOf(sp: SearchParams): string | null {
  const raw = Array.isArray(sp.q) ? sp.q[0] : sp.q
  return typeof raw === 'string' && normalizeQuery(raw) !== '' ? raw : null
}

export async function generateMetadata({ searchParams }: SearchPageProps): Promise<Metadata> {
  const q = termOf(await searchParams)
  const meta = seoMetadata({ path: SEARCH_PATH, noindex: true, siteName: await shopName() })
  if (q === null) return { ...meta, title: TITLE }
  // The same call as the page's (React cache): one search per request.
  const outcome = await searchCatalog(q)
  const shown = outcome.kind === 'found' ? outcome.results.query : normalizeQuery(q)
  return { ...meta, title: `${TITLE}: ${shown}` }
}

/** The page around each outcome: breadcrumbs, the heading, then `children`. */
function page(heading: ReactNode, children: ReactNode) {
  return (
    <div className={cn(CONTAINER, 'pt-2 pb-10 md:pt-4 md:pb-14')}>
      <Breadcrumbs items={[{ name: TITLE }]} className="mb-2" />
      <h1 className="mb-4 text-xl leading-9 font-bold [overflow-wrap:anywhere] text-ink-900 md:mb-6 md:text-2xl md:leading-10">
        {heading}
      </h1>
      {children}
    </div>
  )
}

/**
 * `/search/?q=…`, the results page (content digest §7.1): server-rendered, the API called
 * `no-store` with the visitor's IP (see `searchCatalog`). The heading shows the term the API
 * actually searched (`data.query`, normalised). A term the API refuses (400) gets its reason
 * and a 429 a request to wait: neither is an error page. `noindex, follow`.
 */
export default async function SearchPage({ searchParams }: SearchPageProps) {
  const q = termOf(await searchParams)
  if (q === null) {
    return page(TITLE, <SearchStart />)
  }

  const outcome = await searchCatalog(q)
  if (outcome.kind === 'refused') {
    return page(TITLE, <SearchRefused detail={outcome.detail} q={q} />)
  }
  if (outcome.kind === 'throttled') {
    return page(TITLE, <SearchThrottled q={q} />)
  }

  const { results } = outcome
  const heading = (
    <>
      {'نتایج جستجو برای «'}
      <bdi>{results.query}</bdi>
      {'»'}
    </>
  )
  if (results.total === 0) {
    return page(heading, <NoResults query={results.query} categories={await getCategoryTree()} />)
  }
  const settings = await getProductSettings()
  return page(
    heading,
    <>
      <p className="-mt-2 mb-6 text-base text-ink-600 md:-mt-4">
        {`${formatNumber(results.total)} نتیجه`}
      </p>
      <SearchResults results={results} showOutOfStockLabel={settings.show_out_of_stock_label} />
    </>,
  )
}
