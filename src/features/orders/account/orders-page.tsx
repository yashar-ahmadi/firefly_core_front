'use client'

import { useQueryClient } from '@tanstack/react-query'
import { useRef, useState } from 'react'
import { Pagination } from '@/components/ui/pagination'
import { useSummary } from '@/features/account/dashboard/use-summary'
import { AccountPageHeader } from '@/features/account/layout/account-page-header'
import { ListError } from '@/features/account/lists/list-error'
import { usePageFallback } from '@/features/account/lists/use-page-fallback'
import { useListUrl } from '@/features/account/lists/use-list-url'
import { isLoadingSection } from '@/features/account/use-account-query'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { focusInsteadOfGone, useFocusWhenGone } from './gone-trigger'
import { cardActionSelector, cardHeadingId, OrderCard, type CardAction } from './order-card'
import { LazyCancelDialog, LazyPaySheet, useOverlay } from './order-overlays'
import { OrdersEmpty, OrdersSkeleton } from './orders-states'
import { OrdersTabs } from './orders-tabs'
import { OrdersToolbar } from './orders-toolbar'
import {
  ordersApiQuery,
  ordersSearch,
  parseOrdersParams,
  resolveGroup,
  type OrdersParams,
} from './orders-params'
import { fetchOrders, ordersChanged, ordersListKey, useOrders } from './orders-api'

export const ORDERS_PATH = '/account/orders/'

/**
 * A card's overlay closes: its button still there → back to it (the overlay's own way); gone with
 * what was done (paid, confirmed, cancelled) → the card's heading; the card gone too (its tab no
 * longer holds the order) → the page's heading. Never <body>.
 */
function focusAfterCardOverlay(
  event: Event,
  code: string,
  action: CardAction,
  pageHeading: HTMLElement | null,
): void {
  const card = document.getElementById(cardHeadingId(code))?.closest('article') ?? null
  const opener = card?.querySelector<HTMLElement>(cardActionSelector(action)) ?? null
  const heading = card?.querySelector<HTMLElement>('h2 a') ?? pageHeading
  focusInsteadOfGone(event, opener, heading)
}

/**
 * `/account/orders/` «سفارش‌های من» (order digest §3.1.2, §6.3; dashboard digest §3.2–3.4): the
 * tabs from the summary's groups, the search and the sort, then one card per order, paged. The
 * view is the URL's (`?group=…&sort=…&search=…&page=…`): a click or a sort only rewrites it, the
 * list is read through the BFF. A group the code does not know waits for the summary to say
 * whether it is a tab (never sent otherwise). Skeletons while it loads (the page on screen stays
 * while another loads); «تلاش دوباره» when it cannot be read; a page past the end goes to the
 * last. «پرداخت»/«تأیید سفارش» and «لغو سفارش» open their overlays, loaded on the first press.
 */
export function OrdersPage({
  title,
  catalog,
  supportPhone,
}: {
  title: string
  catalog: PaymentCatalog
  supportPhone: string | null
}) {
  const url = useListUrl(ORDERS_PATH, parseOrdersParams, ordersSearch)
  const { params } = url
  const client = useQueryClient()
  const summary = useSummary()
  const groups = summary.data?.orders.groups
  const summaryKeys = groups
    ? groups.map((group) => group.key)
    : summary.isError && !isLoadingSection(summary)
      ? null
      : undefined
  const group = resolveGroup(params.group, summaryKeys)
  const sent = group.kind === 'pending' ? ({ kind: 'all' } as const) : group
  const query = ordersApiQuery(params, sent)
  const list = useOrders(query, group.kind !== 'pending')
  const goTo = (next: OrdersParams) => url.replace(next)
  const leaving = usePageFallback({
    error: list.error,
    page: params.page,
    readFirst: () => {
      const first = ordersApiQuery({ ...params, page: 1 }, sent)
      return client.fetchQuery({
        queryKey: ordersListKey(first),
        queryFn: ({ signal }) => fetchOrders(first, signal),
      })
    },
    goTo: (page) => goTo({ ...params, page }),
  })

  const pay = useOverlay()
  const cancel = useOverlay()
  // Each overlay its own order: opening one never re-keys the other (a closed sheet read again).
  const [paying, setPaying] = useState<string | null>(null)
  const [cancelling, setCancelling] = useState<string | null>(null)
  // The order the last overlay was opened for: when it leaves the list (read again after the
  // overlay closed; its tab no longer holds it) with the focus on its card, the page's heading
  // takes the focus (a card that stays sees to its own).
  const [acted, setActed] = useState<string | null>(null)
  const open = (overlay: typeof pay, select: (code: string) => void) => (code: string) => {
    select(code)
    setActed(code)
    overlay.show()
  }
  const pageHeading = useRef<HTMLHeadingElement>(null)

  const current = group.kind === 'group' ? group.key : null
  const data = group.kind === 'pending' ? undefined : list.data
  const rows = data?.results ?? []
  useFocusWhenGone(acted !== null && rows.some((order) => order.order_code === acted), pageHeading)
  let body
  if (list.isError && !data && !leaving && !isLoadingSection(list)) {
    body = (
      <ListError
        message="سفارش‌ها بارگذاری نشد."
        error={list.error}
        errorAt={list.errorUpdatedAt}
        onRetry={() => void list.refetch()}
        retrying={list.isFetching}
      />
    )
  } else if (!data || leaving || (rows.length === 0 && params.page > 1)) {
    body = <OrdersSkeleton />
  } else if (rows.length === 0) {
    body = (
      <OrdersEmpty
        searching={params.search !== ''}
        group={current === null ? null : (groups?.find((g) => g.key === current)?.label ?? current)}
        allHref={ORDERS_PATH}
        clearHref={url.href({ ...params, search: '', page: 1 })}
        onFollow={url.follow}
      />
    )
  } else {
    body = (
      <>
        <ul
          aria-label={title}
          aria-busy={list.isPlaceholderData || undefined}
          className="flex flex-col gap-4 transition-opacity aria-busy:opacity-60"
        >
          {rows.map((order) => (
            <li key={order.order_code}>
              <OrderCard
                order={order}
                onPay={open(pay, setPaying)}
                onCancel={open(cancel, setCancelling)}
              />
            </li>
          ))}
        </ul>
        <Pagination
          page={data.current_page}
          totalPages={data.total_pages}
          hrefFor={(page) => url.href({ ...params, page })}
          onFollow={url.followPage}
          className="mt-6"
        />
      </>
    )
  }

  return (
    <>
      <AccountPageHeader title={title} headingRef={pageHeading} />
      <OrdersTabs
        groups={summaryKeys === null ? null : groups}
        total={summary.data?.orders.total}
        current={current}
        href={(key) => url.href({ ...params, group: key, page: 1, search: '' })}
        onFollow={url.follow}
      />
      <OrdersToolbar
        path={ORDERS_PATH}
        params={params}
        count={data && !list.isPlaceholderData ? data.count : undefined}
        onSort={goTo}
        onSearch={url.push}
      />
      {body}
      {/* One sheet and one question for every card, each order's own (keyed by its code: nothing
          another order left in them, a reason typed, a refusal, an open attempt, stays). */}
      {pay.requested && paying && (
        <LazyPaySheet
          key={paying}
          code={paying}
          catalog={catalog}
          supportPhone={supportPhone}
          open={pay.open}
          onOpenChange={pay.setOpen}
          onCloseAutoFocus={(event) =>
            focusAfterCardOverlay(event, paying, 'pay', pageHeading.current)
          }
        />
      )}
      {cancel.requested && cancelling && (
        <LazyCancelDialog
          key={cancelling}
          code={cancelling}
          open={cancel.open}
          onOpenChange={cancel.setOpen}
          onCancelled={(order) =>
            ordersChanged(client, { code: order.order_code, order, wallet: true })
          }
          onStale={() => ordersChanged(client, { code: cancelling })}
          onCloseAutoFocus={(event) =>
            focusAfterCardOverlay(event, cancelling, 'cancel', pageHeading.current)
          }
        />
      )}
    </>
  )
}
