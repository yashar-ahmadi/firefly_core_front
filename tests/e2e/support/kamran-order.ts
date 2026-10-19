import { expect, type APIRequestContext } from '@playwright/test'
import { defaultOption } from '@/features/checkout/shipping-labels'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'
import type { OrderDetail, OrderListItem } from '@/lib/api/types/order-detail'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import type { ShippingOptionList } from '@/lib/api/types/shipping'
import { requestCartWrite } from './cart-write'

// An order of k.yazdi's left awaiting payment (ruling P4-R4: never sara), placed through the BFF
// with his session (`request`: the journey's browser context, signed in by the `kamran` guard):
// his cart emptied, one simple product, his default address as the destination, the operator's
// default shipping, then `POST order/place/` with the cart's total and a new Idempotency-Key. No
// payment intent (the journey presses «پرداخت» itself). The caller hands it to the `kamran`
// guard (`track`), whose teardown cancels it (`cancelKamranOrder`) whatever happened, and puts his
// cart back. Cart writes go through the dev-lock guard (support/cart-write.ts).

const BFF = { 'X-Requested-With': 'ff' }
/** A simple product with stock to spare (the cart's e2e product). */
const VARIANT = 10123

async function data<T>(response: Awaited<ReturnType<APIRequestContext['get']>>, what: string) {
  expect(response.ok(), `${what}: ${response.status()}`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

export async function placeKamranOrder(
  request: APIRequestContext,
  address: number,
): Promise<OrderPlacementResult> {
  const write = (path: string, method: 'POST' | 'DELETE', body?: unknown) =>
    requestCartWrite(request, { method, path, label: `${path} for the orders journey` }, () =>
      method === 'DELETE'
        ? request.delete(`/api/bff/${path}`, { headers: BFF })
        : request.post(`/api/bff/${path}`, { headers: BFF, data: body }),
    )
  const readCart = async () =>
    data<Cart>(await request.get('/api/bff/cart/', { headers: BFF }), 'cart/')
  // Only his own line goes into the order (no cart at all answers `cart_not_found` to a clear).
  if (!(await readCart()).is_empty) await write('cart/clear/', 'DELETE')
  await write('cart/item/add/', 'POST', { variant: VARIANT, quantity: 1 })
  await write('cart/destination/', 'POST', { address })
  const { options } = await data<ShippingOptionList>(
    await request.get('/api/bff/cart/shipping/option/list/', { headers: BFF }),
    'cart/shipping/option/list/',
  )
  const option = defaultOption(options) ?? options.find((item) => item.is_available)
  expect(option, 'a shipping option for his address').toBeDefined()
  await write('cart/shipping/select/', 'POST', { code: option!.code, cash_on_delivery: false })
  const cart = await readCart()
  const placed = await request.post('/api/bff/order/place/', {
    headers: { ...BFF, 'Idempotency-Key': crypto.randomUUID() },
    data: { expected_total: cart.total },
  })
  expect(placed.status(), `order/place/: ${await placed.text()}`).toBe(201)
  return ((await placed.json()) as { data: OrderPlacementResult }).data
}

/**
 * The order cancelled from his account while it awaits payment (order digest §3.1.4); true when
 * it is cancelled now or was already. Never throws.
 */
export async function cancelKamranOrder(
  request: APIRequestContext,
  code: string,
): Promise<boolean> {
  try {
    const read = await request.get(`/api/bff/order/${code}/`, { headers: BFF })
    if (read.ok() && ((await read.json()) as { data: OrderDetail }).data.status === 'cancelled')
      return true
    const response = await request.post(`/api/bff/order/${code}/cancel/`, {
      headers: BFF,
      data: {},
    })
    if (response.ok()) return true
    console.warn(`[kamran-order] the order was not cancelled: ${response.status()}`)
    return false
  } catch {
    console.warn('[kamran-order] the order could not be cancelled (no answer)')
    return false
  }
}

/**
 * The codes of his orders awaiting payment now (one page of 100: a test account's). The guard
 * reads them before a test and after it: any new one is the test's, cancelled however it ended.
 */
export async function awaitingKamranOrders(request: APIRequestContext): Promise<string[]> {
  const read = await request.get('/api/bff/order/list/?status_group=awaiting_payment&limit=100', {
    headers: BFF,
  })
  expect(read.ok(), `his awaiting orders: ${read.status()}`).toBe(true)
  const { results } = ((await read.json()) as { data: Paginated<OrderListItem> }).data
  return results.map(({ order_code }) => order_code)
}
