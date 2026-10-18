'use client'

import {
  keepPreviousData,
  type QueryClient,
  type QueryKey,
  type UseQueryResult,
} from '@tanstack/react-query'
import { useAccountQuery } from '@/features/account/use-account-query'
import { bffFetch } from '@/lib/api/client'
import type { QueryInit } from '@/lib/api/envelope'
import type { Paginated } from '@/lib/api/types/common'
import type { OrderDetail, OrderListItem, OrderQRCode } from '@/lib/api/types/order-detail'
import type { PaymentHistoryDetail, PaymentHistoryItem } from '@/lib/api/types/payment'
import { ORDERS_KEY, SUMMARY_KEY, WALLET_KEY } from '@/lib/session/viewer-queries'

// The account's order reads through the BFF, with the session only (order digest §3.1.2–3.1.5,
// §3.2.9–3.2.10), every key under `ORDERS_KEY` (SESSION_QUERIES: a logout removes them). A
// payment's uuid and the order's `payment_url` (its link's token) are bearer credentials: in
// paths and in this tab's memory only, never logged. The order's uuid is not one (the API
// answers it to the owner's session only) but is never logged either.

export type OrdersPage = Paginated<OrderListItem>
export type PaymentsPage = Paginated<PaymentHistoryItem>

/** The lists, whatever their filters (invalidated after any change to an order). */
export const ORDERS_LISTS_KEY = [...ORDERS_KEY, 'list'] as const

/** One page of the list for this query (the API's own names). */
export const ordersListKey = (query: QueryInit): QueryKey => [...ORDERS_LISTS_KEY, query]
export const orderKey = (code: string): QueryKey => [...ORDERS_KEY, 'detail', code]
export const orderPaymentsKey = (code: string): QueryKey => [...ORDERS_KEY, 'payments', code]
export const paymentDetailKey = (uuid: string): QueryKey => [...ORDERS_KEY, 'payment', uuid]
export const orderQrKey = (code: string): QueryKey => [...ORDERS_KEY, 'qr', code]

export async function fetchOrders(query: QueryInit, signal?: AbortSignal): Promise<OrdersPage> {
  return (await bffFetch<OrdersPage>('order/list/', { query, signal })).data
}

/** `GET order/<code>/`: 404 when the order is not this account's (or there is none). */
export async function fetchOrder(code: string, signal?: AbortSignal): Promise<OrderDetail> {
  return (await bffFetch<OrderDetail>(`order/${code}/`, { signal })).data
}

/** The list for `query`; the page on screen stays while the next loads. Off while `enabled` is. */
export function useOrders(query: QueryInit, enabled = true): UseQueryResult<OrdersPage> {
  return useAccountQuery({
    queryKey: ordersListKey(query),
    queryFn: ({ signal }) => fetchOrders(query, signal),
    placeholderData: keepPreviousData,
    enabled,
  })
}

/** An order (`initial`: what the server read for the page's first render). */
export function useOrder(code: string, initial?: OrderDetail): UseQueryResult<OrderDetail> {
  return useAccountQuery({
    queryKey: orderKey(code),
    queryFn: ({ signal }) => fetchOrder(code, signal),
    initialData: initial,
  })
}

/** Its payments, newest first (`GET payment/history/?order_code=`; one page is all of them). */
export function useOrderPayments(code: string): UseQueryResult<PaymentsPage> {
  return useAccountQuery({
    queryKey: orderPaymentsKey(code),
    queryFn: async ({ signal }) =>
      (
        await bffFetch<PaymentsPage>('payment/history/', {
          query: { order_code: code, limit: 100 },
          signal,
        })
      ).data,
  })
}

/** One payment's detail (`GET payment/history/<uuid>/`): a card transfer's receipt. */
export function usePaymentDetail(uuid: string, enabled: boolean) {
  return useAccountQuery({
    queryKey: paymentDetailKey(uuid),
    queryFn: async ({ signal }) =>
      (await bffFetch<PaymentHistoryDetail>(`payment/history/${uuid}/`, { signal })).data,
    enabled,
  })
}

export function useOrderQr(code: string): UseQueryResult<OrderQRCode> {
  return useAccountQuery({
    queryKey: orderQrKey(code),
    queryFn: async ({ signal }) =>
      (await bffFetch<OrderQRCode>(`order/${code}/qr-code/`, { signal })).data,
  })
}

/**
 * After an order changed (paid, confirmed, cancelled, reviewed): the lists, the summary's
 * counters and, when given, that order and its payments are read again. `order`: the API's own
 * answer (a cancellation's), shown at once.
 */
export function ordersChanged(
  client: QueryClient,
  { code, order, wallet = false }: { code?: string; order?: OrderDetail; wallet?: boolean } = {},
): void {
  if (order) client.setQueryData(orderKey(order.order_code), order)
  const keys: QueryKey[] = [ORDERS_LISTS_KEY, SUMMARY_KEY]
  if (code && !order) keys.push(orderKey(code))
  if (code) keys.push(orderPaymentsKey(code))
  if (wallet) keys.push(WALLET_KEY)
  for (const queryKey of keys) void client.invalidateQueries({ queryKey })
}
