'use client'

import { useQueries, type UseQueryResult } from '@tanstack/react-query'
import { GitCompareArrows } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { Skeleton } from '@/components/ui/skeleton'
import { productDetailQuery } from '@/features/product/product-query'
import { isApiNotFound } from '@/lib/api/errors'
import type { ProductDetail } from '@/lib/api/types/catalog'
import { usePersistHydration } from '@/lib/store/persisted'
import { CompareTable, type CompareColumn } from './compare-table'
import { useCompare } from './store'

const EMPTY = 'هنوز کالایی برای مقایسه انتخاب نکرده\u{200C}اید'
const ONE_MORE = 'برای مقایسه، دست\u{200C}کم یک کالای دیگر به فهرست بیفزایید.'
const gone = (name: string) => `«${name}» دیگر موجود نیست و از فهرست مقایسه برداشته شد.`

/** The server's and hydration's render, and the wait for the products. */
function CompareSkeleton() {
  return (
    <div role="status" aria-busy="true" className="rounded-card bg-white p-3 shadow-card">
      <span className="sr-only">در حال بارگذاری مقایسه</span>
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2].map((column) => (
          <div key={column} className="flex w-40 shrink-0 flex-col gap-2 md:w-56">
            <Skeleton className="size-16 md:size-24" />
            <Skeleton className="h-5 w-full" />
            <Skeleton className="h-5 w-24" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="mt-3 h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        ))}
      </div>
    </div>
  )
}

function CompareEmpty() {
  return (
    <EmptyState
      icon={<GitCompareArrows />}
      title={EMPTY}
      description={'دکمه\u{0654} مقایسه روی کارت هر کالا آن را به این فهرست می\u{200C}افزاید.'}
      action={
        <Button asChild variant="outline">
          <Link href="/">{'بازگشت به صفحه\u{0654} اصلی'}</Link>
        </Button>
      }
      className="rounded-card bg-white shadow-card"
    />
  )
}

type ProductQuery = UseQueryResult<ProductDetail>

/**
 * Whether the product's read failed: an error now, or one kept while «تلاش دوباره» runs (a
 * refetch of a query without data puts it back to `pending`, but `errorUpdatedAt` stays).
 */
function hasFailed(query: ProductQuery | undefined): query is ProductQuery {
  return query !== undefined && (query.isError || (query.isPending && query.errorUpdatedAt > 0))
}

/**
 * The compare page's body: the list saved on this device (`ff-compare`), each product's payload
 * read through the BFF in parallel (the queries quick view shares), then the table. The server
 * and hydration render a loading shell (the list is only known in the browser), and so does the
 * wait until a first product answers; the others join the table as they arrive. A product that
 * answers 404 is taken off the list with a note; one that fails otherwise keeps its column with
 * a retry, beside the products that loaded, and keeps it while the retry runs. Removing a
 * column moves the focus to the next one's «حذف از مقایسه», or to the page heading when none is
 * left. `headingId` names the page's `<h1>` (focusable from code).
 */
export function CompareView({ headingId }: { headingId: string }) {
  const hydrated = usePersistHydration(useCompare)
  const items = useCompare((state) => state.items)
  const remove = useCompare((state) => state.remove)
  const queries = useQueries({ queries: items.map((item) => productDetailQuery(item.slug)) })
  const rootRef = useRef<HTMLDivElement>(null)
  const focusAfterRemove = useRef<number | null>(null)

  // The products that no longer exist: noted (kept after they leave the list), then removed.
  const missing = items.filter((_, index) => isApiNotFound(queries[index]?.error))
  const [goneNames, setGoneNames] = useState<string[]>([])
  const fresh = missing.filter((item) => !goneNames.includes(item.name))
  if (fresh.length > 0) setGoneNames([...goneNames, ...fresh.map((item) => item.name)])
  const missingKey = missing.map((item) => item.slug).join('\n')
  useEffect(() => {
    if (missingKey) for (const slug of missingKey.split('\n')) remove(slug)
  }, [missingKey, remove])

  useEffect(() => {
    const index = focusAfterRemove.current
    if (index === null) return
    focusAfterRemove.current = null
    const buttons = rootRef.current?.querySelectorAll<HTMLElement>('[data-compare-remove]')
    const next = buttons?.[Math.min(index, buttons.length - 1)]
    if (next) next.focus()
    else document.getElementById(headingId)?.focus()
  }, [items, headingId])

  const notice = goneNames.length > 0 && (
    <p role="status" className="rounded-control bg-info/10 px-4 py-3 text-base text-ink-800">
      {goneNames.map(gone).join(' ')}
    </p>
  )

  let body
  if (!hydrated) {
    body = <CompareSkeleton />
  } else if (items.length === 0) {
    body = <CompareEmpty />
  } else if (!queries.some((query) => query.data !== undefined || hasFailed(query))) {
    body = <CompareSkeleton />
  } else {
    // A product that failed to load keeps its column, with a retry; one gone (404) is dropped,
    // and one still on its way joins when it arrives.
    const columns = items.flatMap((item, index): CompareColumn[] => {
      const query = queries[index]
      if (query?.data) return [{ kind: 'product', product: query.data }]
      if (!hasFailed(query) || isApiNotFound(query.error)) return []
      return [
        { kind: 'failed', item, onRetry: () => void query.refetch(), retrying: query.isFetching },
      ]
    })
    body = (
      <>
        {items.length === 1 && <p className="text-base text-ink-700">{ONE_MORE}</p>}
        <CompareTable
          columns={columns}
          onRemove={(slug) => {
            focusAfterRemove.current = items.findIndex((item) => item.slug === slug)
            remove(slug)
          }}
        />
      </>
    )
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {notice}
      {body}
    </div>
  )
}
