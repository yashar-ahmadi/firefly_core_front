'use client'

import { useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pagination } from '@/components/ui/pagination'
import {
  listingHref,
  parseListingParams,
  toSearchParams,
  type ListingApiQuery,
} from '@/features/catalog/listing-params'
import { bffFetch } from '@/lib/api/client'
import { isApiNotFound } from '@/lib/api/errors'
import type { ProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { toPersianDigits } from '@/lib/format'
import { GRID_GAP_TOP, ProductGrid } from '../product-grid'
import { focusListingResults } from './listing-focus'
import { useListingPending } from './use-listing-url'

export interface LoadMoreProps {
  /** The API query of the server's page: route context and default sort included. */
  apiQuery: ListingApiQuery
  /** The URL's filters (no route context keys), for the page links. */
  urlQuery: ListingApiQuery
  /** The route's path with its trailing slash. */
  basePath: string
  /** The page the server rendered, and the number of pages. */
  page: number
  totalPages: number
  /** The products the server grid already shows: never shown twice. */
  initialIds: number[]
  showOutOfStockLabel: boolean
}

interface AppendedPage {
  page: number
  products: ProductCard[]
}

const pageOf = (params: URLSearchParams) =>
  parseListingParams({ page: params.get('page') ?? undefined }).page ?? 1

/**
 * Under the server-rendered grid: «نمایش بیشتر» appends the next page, fetched through the BFF
 * with the same API query, and the real-link pager (crawlable, and the way without JavaScript).
 * Cards already shown are skipped (a product can move between pages as stock changes), and focus
 * moves to the first new card. The BFF request is the visitor's own (it may carry their session);
 * the card ignores `is_in_wishlist`, so appended cards match the server-rendered ones.
 *
 * The URL: after each append, `history.replaceState` sets `page` to the last page shown (no new
 * history entry, no server render), and the pager's «next» goes on from there. Appended pages
 * are not kept: a reload, or Back from a product, renders that URL on the server, so the last
 * page shown appears alone with the pager on it (checked in the browser).
 *
 * Next turns a native `replaceState` into a router restore that discards a navigation in flight,
 * so a filter, sort or page change always wins: a pending listing transition or a pager click
 * aborts the request (nothing is appended, the URL is left alone), and no request starts while
 * a transition is pending. Remount it (a `key` per query) when the query changes; going to
 * another page of the same query starts over.
 */
export function LoadMore({
  apiQuery,
  urlQuery,
  basePath,
  page,
  totalPages,
  initialIds,
  showOutOfStockLabel,
}: LoadMoreProps) {
  const [appended, setAppended] = useState<AppendedPage[]>([])
  const [total, setTotal] = useState(totalPages)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const last = appended.at(-1)?.page ?? page

  // A pager link to another page of this same query keeps this component mounted: start over
  // when the URL's page moves to one this component did not set.
  const urlPage = pageOf(useSearchParams())
  const [seenUrlPage, setSeenUrlPage] = useState(urlPage)
  if (urlPage !== seenUrlPage) {
    setSeenUrlPage(urlPage)
    if (urlPage !== last) setAppended([])
  }

  const containerRef = useRef<HTMLDivElement>(null)
  const focusPage = useRef<number | null>(null)
  const request = useRef<AbortController | null>(null)
  useEffect(() => () => request.current?.abort(), [])
  const pending = useListingPending()
  useEffect(() => {
    if (pending) request.current?.abort()
  }, [pending])

  useEffect(() => {
    const target = focusPage.current
    if (target === null) return
    focusPage.current = null
    containerRef.current?.querySelector<HTMLElement>(`[data-page="${target}"] article a`)?.focus()
  }, [appended])

  async function loadNext() {
    if (pending) return
    const next = last + 1
    const controller = new AbortController()
    request.current = controller
    setLoading(true)
    setFailed(false)
    try {
      const { data } = await bffFetch<Paginated<ProductCard>>('product/list', {
        query: Object.fromEntries(toSearchParams({ ...apiQuery, page: next })),
        signal: controller.signal,
      })
      if (controller.signal.aborted) return
      const seen = new Set([...initialIds, ...appended.flatMap((p) => p.products.map((x) => x.id))])
      const products: ProductCard[] = []
      for (const product of data.results) {
        if (seen.has(product.id)) continue
        seen.add(product.id)
        products.push(product)
      }
      window.history.replaceState(null, '', listingHref(basePath, { ...urlQuery, page: next }))
      focusPage.current = products.length > 0 ? next : null
      setAppended((pages) => [...pages, { page: next, products }])
      setTotal(data.total_pages)
    } catch (error) {
      if (controller.signal.aborted) return
      if (isApiNotFound(error)) {
        // The list shrank since the server rendered it: there is no next page, and the button
        // that had focus goes away.
        setTotal(last)
        focusListingResults()
      } else {
        setFailed(true)
      }
    } finally {
      if (request.current === controller) setLoading(false)
    }
  }

  return (
    <div ref={containerRef}>
      {appended.map(({ page: number, products }) =>
        products.length > 0 ? (
          <div key={number} data-page={number} className={GRID_GAP_TOP}>
            <ProductGrid
              products={products}
              showOutOfStockLabel={showOutOfStockLabel}
              columns="sidebar"
              withAction
              priorityCount={0}
              label={`صفحهٔ ${toPersianDigits(number)}`}
            />
          </div>
        ) : null,
      )}

      {last < total && (
        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            variant="outline"
            size="lg"
            loading={loading}
            disabled={pending}
            onClick={loadNext}
            className="min-w-60"
          >
            نمایش بیشتر
          </Button>
          {failed && (
            <p role="alert" className="text-base text-danger">
              بارگذاری کالاهای بیشتر انجام نشد. دوباره تلاش کنید.
            </p>
          )}
        </div>
      )}

      {/* A page link wins over a request in flight (see above). */}
      <div onClickCapture={() => request.current?.abort()}>
        <Pagination
          page={last}
          totalPages={total}
          hrefFor={(target) => listingHref(basePath, { ...urlQuery, page: target })}
          className="mt-6 border-t border-ink-200 pt-6"
        />
      </div>
    </div>
  )
}
