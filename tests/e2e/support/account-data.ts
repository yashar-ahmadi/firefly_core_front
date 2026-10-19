import { expect, type APIRequestContext } from '@playwright/test'
import type { Address } from '@/lib/api/types/address'
import type { Cart } from '@/lib/api/types/cart'
import type { Paginated } from '@/lib/api/types/common'

// What the signed-in order journeys change in a demo account (ruling P4-R4: k.yazdi's checkout
// and orders, shirin's reorder and wallet order; never sara's), read before a test starts and put
// back exactly afterwards (support/account-guard.ts): the cart's lines, its destination and
// shipping choice, and the address book (its default included). Through the BFF with that
// account's session (`request`).

/** An address the guard adds for a moment (a destination cannot be cleared otherwise). */
export const CHECKOUT_MARKER = 'آزمون خودکار پرداخت'

const HEADERS = { 'X-Requested-With': 'ff' }

export interface AccountData {
  /** The cart's lines: variant and quantity, sorted by variant. */
  lines: { variant: number; quantity: number }[]
  destination: { address: number } | { province: number; city: number } | null
  shipping: { code: string; cod: boolean } | null
  /** The address book in its order (the default first). */
  addresses: { id: number; title: string; isDefault: boolean }[]
}

async function get<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/bff/${path}`, { headers: HEADERS })
  expect(response.ok(), `GET ${path}: ${response.status()}`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

async function write<T = unknown>(
  request: APIRequestContext,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: object,
): Promise<T> {
  const response = await request.fetch(`/api/bff/${path}`, { method, headers: HEADERS, data })
  const text = await response.text()
  expect(response.ok(), `${method} ${path}: ${response.status()} ${text}`).toBe(true)
  return (text ? (JSON.parse(text) as { data: T }).data : null) as T
}

function destinationOf(cart: Cart): AccountData['destination'] {
  const { destination } = cart
  if (!destination || destination.city_id === null) return null
  if (destination.address) return { address: destination.address.id }
  return { province: destination.province_id!, city: destination.city_id }
}

export async function readAccountData(request: APIRequestContext): Promise<AccountData> {
  const [cart, book] = await Promise.all([
    get<Cart>(request, 'cart/'),
    get<Paginated<Address>>(request, 'account/address/list/?limit=100'),
  ])
  const { shipping } = cart
  return {
    lines: cart.lines
      .map(({ variant_id, quantity }) => ({ variant: variant_id, quantity }))
      .sort((a, b) => a.variant - b.variant),
    destination: destinationOf(cart),
    shipping: shipping.is_selected
      ? { code: shipping.code!, cod: shipping.cash_on_delivery }
      : null,
    addresses: book.results.map(({ id, title, is_default }) => ({
      id,
      title,
      isDefault: is_default,
    })),
  }
}

/** The lines as `before`: new ones removed, quantities set back, lost ones added. */
async function restoreLines(request: APIRequestContext, before: AccountData['lines']) {
  const wanted = new Map(before.map(({ variant, quantity }) => [variant, quantity]))
  const now = (await readAccountData(request)).lines
  for (const { variant, quantity } of now) {
    const quantityBefore = wanted.get(variant)
    if (quantityBefore === undefined) await write(request, 'DELETE', `cart/item/${variant}/remove/`)
    else if (quantityBefore !== quantity)
      await write(request, 'PUT', `cart/item/${variant}/`, { quantity: quantityBefore })
  }
  for (const { variant, quantity } of before) {
    if (!now.some((line) => line.variant === variant))
      await write(request, 'POST', 'cart/item/add/', { variant, quantity })
  }
}

/** The book as `before`: addresses added since deleted, the default set back. */
async function restoreAddresses(request: APIRequestContext, before: AccountData['addresses']) {
  const kept = new Set(before.map(({ id }) => id))
  const def = before.find(({ isDefault }) => isDefault)
  const now = (await readAccountData(request)).addresses
  if (def && !now.find(({ id }) => id === def.id)?.isDefault) {
    await write(request, 'POST', `account/address/${def.id}/set-default/`)
  }
  for (const { id } of now) {
    if (!kept.has(id)) await write(request, 'DELETE', `account/address/${id}/delete/`)
  }
}

/**
 * The destination as `before`, which also clears any shipping choice made since (every
 * destination call clears it). No destination at all cannot be asked for: a marker address
 * becomes the destination and is deleted, which leaves none (cart digest §7.4).
 */
async function restoreDestination(request: APIRequestContext, before: AccountData['destination']) {
  if (before) return void (await write(request, 'POST', 'cart/destination/', before))
  const now = await readAccountData(request)
  if (now.destination === null && now.shipping === null) return
  const marker = await write<Address>(request, 'POST', 'account/address/create/', {
    title: CHECKOUT_MARKER,
    receiver_first_name: 'آزمون',
    receiver_last_name: 'خودکار',
    receiver_mobile: '09121234567',
    province: 8,
    city: 301,
    address: 'نشانی موقت آزمون',
    is_default: false,
  })
  await write(request, 'POST', 'cart/destination/', { address: marker.id })
  await write(request, 'DELETE', `account/address/${marker.id}/delete/`)
}

/**
 * All of it as `before` (the order matters: lines and book, then destination, then choice); `who`
 * names the account in the failure.
 */
export async function restoreAccountData(
  request: APIRequestContext,
  before: AccountData,
  who: string,
) {
  await restoreLines(request, before.lines)
  await restoreAddresses(request, before.addresses)
  await restoreDestination(request, before.destination)
  if (before.shipping) {
    await write(request, 'POST', 'cart/shipping/select/', {
      code: before.shipping.code,
      cash_on_delivery: before.shipping.cod,
    })
  }
  expect(await readAccountData(request), `${who}’s cart and address book as they were`).toEqual(
    before,
  )
}

/** Takes out the marker addresses an earlier run left (it stopped before its restore). */
export async function removeCheckoutMarkers(request: APIRequestContext): Promise<void> {
  for (const { id, title } of (await readAccountData(request)).addresses) {
    if (title === CHECKOUT_MARKER) await write(request, 'DELETE', `account/address/${id}/delete/`)
  }
}
