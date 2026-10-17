import { expect, type APIRequestContext } from '@playwright/test'
import type { Address } from '@/lib/api/types/address'
import type { Cart } from '@/lib/api/types/cart'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'

// What the write journeys change in sara's account (the shared dev backend), read before they
// start and put back exactly afterwards: her address book (which one is the default included),
// her wishlist and her cart's lines with their quantities. Everything goes through the BFF with
// the session of `request` (a signed-in page's `page.request`, or a context made from the
// project's shared session). Never her password, contact, two-step login, comments or
// notifications' read state: no journey touches them.

const HEADERS = { 'X-Requested-With': 'ff' }

export interface SaraData {
  /** Every address, in the book's order (the default first), as id, title and the flag. */
  addresses: { id: number; title: string; isDefault: boolean }[]
  /** The saved products' ids and slugs, newest first. */
  wishlist: { id: number; slug: string }[]
  /** The cart's lines: variant and quantity, sorted by variant. */
  cart: { variant: number; quantity: number }[]
}

async function bffGet<T>(request: APIRequestContext, path: string): Promise<T> {
  const response = await request.get(`/api/bff/${path}`, { headers: HEADERS })
  expect(response.ok(), `GET ${path}: ${response.status()}`).toBe(true)
  return ((await response.json()) as { data: T }).data
}

async function bffWrite(
  request: APIRequestContext,
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  data?: object,
): Promise<void> {
  const response = await request.fetch(`/api/bff/${path}`, { method, headers: HEADERS, data })
  expect(response.ok(), `${method} ${path}: ${response.status()} ${await response.text()}`).toBe(
    true,
  )
}

export async function readAddresses(request: APIRequestContext): Promise<SaraData['addresses']> {
  const book = await bffGet<Paginated<Address>>(request, 'account/address/list/?limit=100')
  return book.results.map(({ id, title, is_default }) => ({ id, title, isDefault: is_default }))
}

export async function readWishlist(request: APIRequestContext): Promise<SaraData['wishlist']> {
  const list = await bffGet<Paginated<WishlistProductCard>>(
    request,
    'product/wishlist/list/?limit=100',
  )
  return list.results.map(({ id, slug }) => ({ id, slug }))
}

export async function readCart(request: APIRequestContext): Promise<SaraData['cart']> {
  const cart = await bffGet<Cart>(request, 'cart/')
  return cart.lines
    .map(({ variant_id, quantity }) => ({ variant: variant_id, quantity }))
    .sort((a, b) => a.variant - b.variant)
}

export async function readSaraData(request: APIRequestContext): Promise<SaraData> {
  const [addresses, wishlist, cart] = await Promise.all([
    readAddresses(request),
    readWishlist(request),
    readCart(request),
  ])
  return { addresses, wishlist, cart }
}

/** The address book as `before`: addresses added since are deleted, the default set back. */
export async function restoreAddresses(
  request: APIRequestContext,
  before: SaraData['addresses'],
): Promise<void> {
  const kept = new Set(before.map(({ id }) => id))
  const def = before.find(({ isDefault }) => isDefault)
  // The default first: deleting a default promotes the newest address left (by the API).
  const now = await readAddresses(request)
  if (def && !now.find(({ id }) => id === def.id)?.isDefault) {
    await bffWrite(request, 'POST', `account/address/${def.id}/set-default/`)
  }
  for (const { id } of now) {
    if (!kept.has(id)) await bffWrite(request, 'DELETE', `account/address/${id}/delete/`)
  }
  expect(await readAddresses(request), 'sara’s address book as it was').toEqual(before)
}

/** The wishlist as `before`: products saved since are taken out. */
export async function restoreWishlist(
  request: APIRequestContext,
  before: SaraData['wishlist'],
): Promise<void> {
  const kept = new Set(before.map(({ id }) => id))
  for (const { id, slug } of await readWishlist(request)) {
    if (!kept.has(id)) await bffWrite(request, 'DELETE', `product/detail/${slug}/wishlist/`)
  }
  expect(await readWishlist(request), 'sara’s wishlist as it was').toEqual(before)
}

/** The cart's lines as `before`: new lines removed, changed quantities set back, lost ones added. */
export async function restoreCart(
  request: APIRequestContext,
  before: SaraData['cart'],
): Promise<void> {
  const quantities = new Map(before.map(({ variant, quantity }) => [variant, quantity]))
  const now = await readCart(request)
  for (const { variant, quantity } of now) {
    const wanted = quantities.get(variant)
    if (wanted === undefined) await bffWrite(request, 'DELETE', `cart/item/${variant}/remove/`)
    else if (wanted !== quantity)
      await bffWrite(request, 'PUT', `cart/item/${variant}/`, { quantity: wanted })
  }
  for (const { variant, quantity } of before) {
    if (!now.some((line) => line.variant === variant))
      await bffWrite(request, 'POST', 'cart/item/add/', { variant, quantity })
  }
  expect(await readCart(request), 'sara’s cart as it was').toEqual(before)
}
