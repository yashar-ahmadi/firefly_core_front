'use client'

import { useQueryClient } from '@tanstack/react-query'
import { Info, MessageSquareHeart } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { EmptyState } from '@/components/ui/empty-state'
import { Pagination } from '@/components/ui/pagination'
import { Skeleton } from '@/components/ui/skeleton'
import { tell } from '@/components/ui/tell'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ListError } from '@/features/account/lists/list-error'
import { usePageFallback } from '@/features/account/lists/use-page-fallback'
import { useListUrl } from '@/features/account/lists/use-list-url'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { AwaitingReviewOrder, AwaitingReviewProduct } from '@/lib/api/types/order-review'
import { useOverlay } from '../account/order-overlays'
import { ordersChanged } from '../account/orders-api'
import { AwaitingReviewCard, reviewCardId } from './awaiting-review-card'
import type { ReviewDialogProps } from './review-dialog'
import { parseReviewsParams, reviewsSearch } from './reviews-params'
import {
  AWAITING_REVIEWS_KEY,
  awaitingReviewsKey,
  fetchAwaitingReviews,
  useAwaitingReviews,
  type AwaitingPage,
} from './reviews-api'

export const REVIEWS_PATH = '/account/reviews/'

// The review form, its own chunk: fetched on the first «ثبت دیدگاه».
const ReviewDialog = dynamic<ReviewDialogProps>(
  () =>
    import('./review-dialog')
      .then((module) => module.ReviewDialog)
      .catch(
        () =>
          function Unavailable({ open }: ReviewDialogProps) {
            return open ? (
              <p role="alert" className="text-base leading-7 text-danger">
                فرم دیدگاه بارگذاری نشد؛ صفحه را دوباره باز کنید.
              </p>
            ) : null
          },
      ),
  { ssr: false },
)

type Pair = { order: AwaitingReviewOrder; product: AwaitingReviewProduct }

/** The page without one purchase (and without its order once nothing of it is left). */
function without(page: AwaitingPage, { order, product }: Pair): AwaitingPage {
  const results = page.results
    .map((entry) =>
      entry.order_code === order.order_code
        ? { ...entry, products: entry.products.filter((item) => item.id !== product.id) }
        : entry,
    )
    .filter((entry) => entry.products.length > 0)
  return { ...page, count: Math.max(0, page.count - 1), results }
}

/**
 * `/account/reviews/` «در انتظار دیدگاه» (order digest §3.1.6–3.1.7, §6.5): a card per purchase
 * awaiting a review, newest delivery first, paged; «ثبت دیدگاه» opens the review form. A review
 * sent: the API's sentence, the purchase off the list at once, the list, the summary and the
 * order read again, the focus to the next purchase (or the heading). A purchase that cannot be
 * reviewed any more: why, and the list read again. The order page's link lands on its purchase.
 */
export function AwaitingReviewsPage({ title }: { title: string }) {
  const url = useListUrl(REVIEWS_PATH, parseReviewsParams, reviewsSearch)
  const { params } = url
  const client = useQueryClient()
  const query = useAwaitingReviews(params.page)
  const goToPage = (page: number) => url.replace({ ...params, page, target: null })
  const leaving = usePageFallback({
    error: query.error,
    page: params.page,
    readFirst: () =>
      client.fetchQuery({
        queryKey: awaitingReviewsKey(1),
        queryFn: ({ signal }) => fetchAwaitingReviews(1, signal),
      }),
    goTo: goToPage,
  })
  const dialog = useOverlay()
  const [chosen, setChosen] = useState<Pair | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const heading = useRef<HTMLHeadingElement>(null)
  const targetButton = useRef<HTMLButtonElement>(null)
  /** Where the focus goes once the dialog has closed (a card that went with it). */
  const nextFocus = useRef<string | null>(null)
  const data = query.data
  const pairs: Pair[] = (data?.results ?? []).flatMap((order) =>
    order.products.map((product) => ({ order, product })),
  )
  const isTarget = ({ order, product }: Pair) =>
    params.target?.order === order.order_code && params.target.product === product.slug
  const targetShown = pairs.some(isTarget)

  // The purchase the order's page sent the shopper to: its button takes the focus, once.
  const focused = useRef(false)
  useEffect(() => {
    if (focused.current || !targetShown) return
    focused.current = true
    targetButton.current?.focus()
    targetButton.current?.scrollIntoView?.({ block: 'center' })
  }, [targetShown])

  const done = (pair: Pair, focusAfter: string | null) => {
    nextFocus.current = focusAfter
    void client.invalidateQueries({ queryKey: AWAITING_REVIEWS_KEY })
    ordersChanged(client, { code: pair.order.order_code })
    dialog.setOpen(false)
  }
  const submitted = (pair: Pair, message: string) => {
    const index = pairs.findIndex(
      (item) => item.order === pair.order && item.product.id === pair.product.id,
    )
    const next = pairs[index + 1] ?? pairs[index - 1]
    client.setQueryData<AwaitingPage>(awaitingReviewsKey(params.page), (page) =>
      page ? without(page, pair) : page,
    )
    tell(message)
    setNotice(null)
    done(pair, next ? reviewCardId(next.order.order_code, next.product.id) : null)
  }
  const stale = (pair: Pair, reason: string) => {
    setNotice(reason)
    done(pair, null)
  }

  let body
  if (query.isError && !data && !leaving && !isLoadingSection(query)) {
    body = (
      <ListError
        message="فهرست خریدهای در انتظار دیدگاه بارگذاری نشد."
        error={query.error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  } else if (!data || leaving || (pairs.length === 0 && params.page > 1)) {
    body = (
      <div aria-busy="true" className="flex flex-col gap-4">
        <VisuallyHidden role="status">در حال بارگذاری</VisuallyHidden>
        <Skeleton className="h-24 rounded-card" />
        <Skeleton className="h-24 rounded-card" />
      </div>
    )
  } else if (pairs.length === 0) {
    body = (
      <EmptyState
        icon={<MessageSquareHeart />}
        title="دیدگاهی در انتظار شما نیست"
        description="کالاهایی که تحویل گرفته‌اید و هنوز درباره‌شان دیدگاه ننوشته‌اید این‌جا می‌آیند."
        className="rounded-card bg-white py-12 shadow-card"
        action={
          <Link href="/account/orders/" className={buttonClasses({ variant: 'outline' })}>
            سفارش‌های من
          </Link>
        }
      />
    )
  } else {
    body = (
      <>
        <ul aria-label={title} className="flex flex-col gap-4">
          {pairs.map((pair) => (
            <li key={reviewCardId(pair.order.order_code, pair.product.id)}>
              <AwaitingReviewCard
                order={pair.order}
                product={pair.product}
                target={isTarget(pair)}
                buttonRef={isTarget(pair) ? targetButton : undefined}
                onReview={() => {
                  setChosen(pair)
                  dialog.show()
                }}
              />
            </li>
          ))}
        </ul>
        <Pagination
          page={data.current_page}
          totalPages={data.total_pages}
          hrefFor={(page) => url.href({ ...params, page, target: null })}
          onFollow={url.followPage}
          className="mt-6"
        />
      </>
    )
  }

  return (
    <>
      <AccountPageHeader title={title} headingRef={heading} />
      <p role="status" className="empty:hidden">
        {notice && (
          <span className="mb-4 flex items-start gap-2 rounded-card bg-info/10 px-4 py-3 text-base leading-7 text-ink-800">
            <Info aria-hidden className="mt-1 size-5 shrink-0 text-info" />
            {notice}
          </span>
        )}
      </p>
      {body}
      {dialog.requested && chosen && (
        <ReviewDialog
          orderCode={chosen.order.order_code}
          product={chosen.product}
          open={dialog.open}
          onOpenChange={dialog.setOpen}
          onSubmitted={(message) => submitted(chosen, message)}
          onStale={(reason) => stale(chosen, reason)}
          onCloseAutoFocus={(event) => {
            const id = nextFocus.current
            if (id === null && !notice) return
            nextFocus.current = null
            event.preventDefault()
            const next = id && document.getElementById(id)?.querySelector('button')
            ;(next || heading.current)?.focus()
          }}
        />
      )}
    </>
  )
}
