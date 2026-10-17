import { expect, type APIRequestContext } from '@playwright/test'
import type { Address } from '@/lib/api/types/address'
import type { Cart } from '@/lib/api/types/cart'
import type { WishlistProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'

// What the write journeys change in sara's account (the shared dev backend), read before they
// start and put back exactly afterwards (support/sara-guard.ts does both): her address book
// (which one is the default included), her wishlist and her cart's lines with their quantities.
// Everything goes through the BFF with the session of `request` (a request context made from the
// project's shared session). Never her password, contact, two-step login, comments or
// notifications' read state: no journey touches them.

/**
 * What the journeys add, and nothing real has: an address by this title, this product in the
 * wishlist, a cart line of this product (the guest's line the login merges).
 */
export const MARKERS = {
  addressTitle: 'آزمون خودکار e2e',
  wishlist: { slug: 'apple-iphone-15', name: 'گوشی موبایل اپل آیفون ۱۵' },
  cartProduct: 'samsung-galaxy-a56',
} as const

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

/**
 * Takes out what a journey of an earlier run left behind (it stopped before its restore, or its
 * snapshot is gone): the marker address, the marker product in the wishlist, its cart line.
 */
export async function removeMarkers(request: APIRequestContext): Promise<void> {
  for (const { id, title } of await readAddresses(request)) {
    if (title === MARKERS.addressTitle)
      await bffWrite(request, 'DELETE', `account/address/${id}/delete/`)
  }
  if ((await readWishlist(request)).some(({ slug }) => slug === MARKERS.wishlist.slug))
    await bffWrite(request, 'DELETE', `product/detail/${MARKERS.wishlist.slug}/wishlist/`)
  for (const { variant_id, product_slug } of (await bffGet<Cart>(request, 'cart/')).lines) {
    if (product_slug === MARKERS.cartProduct)
      await bffWrite(request, 'DELETE', `cart/item/${variant_id}/remove/`)
  }
}

/** All of sara's data as `before`: each part restored even when another fails (then rethrown). */
export async function restoreSara(request: APIRequestContext, before: SaraData): Promise<void> {
  const failures: unknown[] = []
  for (const restore of [
    () => restoreAddresses(request, before.addresses),
    () => restoreWishlist(request, before.wishlist),
    () => restoreCart(request, before.cart),
  ]) {
    await restore().catch((error: unknown) => failures.push(error))
  }
  if (failures.length > 0) {
    const messages = failures.map((error) => (error instanceof Error ? error.message : `${error}`))
    throw new Error(`sara's data could not be put back:\n${messages.join('\n\n')}`)
  }
}
