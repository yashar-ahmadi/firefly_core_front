import { isRecord, readJson, writeJson } from '@/lib/store/json-storage'

// A guest's recent orders on this device (order digest §5.2 step 3; Plan 4 Global Constraints):
// the last 10 in localStorage (`ff-guest-orders`), newest first. Guest orders are never linked to
// an account, so this, the SMS and tracking by code and mobile are their only way back. The link
// token is a credential: it is kept here once (the link's URL is `payLinkPath(linkToken)`), never
// logged. No mobile number is ever kept (tracking asks for it every time: a shared device). Each
// order is kept 30 days on this device: its link pays or cancels only until the payment deadline
// (72 hours by default, a week after a card-transfer receipt), and the code stays for tracking
// while the order is on its way; older ones are no longer read and leave the storage at the next
// write or prune. Entries kept before that (with the link's URL as well, without their time) are
// read as they are, timed by their placement, and rewritten without the URL. A storage that
// refuses never throws.

export const GUEST_ORDERS_KEY = 'ff-guest-orders'
export const GUEST_ORDERS_MAX = 10
export const GUEST_ORDER_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000

export interface GuestOrder {
  orderCode: string
  /** The payment link's token: its URL is `payLinkPath(linkToken)`. */
  linkToken: string
  /** The payment deadline (ISO); null after a cancellation. */
  expiresAt: string | null
  /** Owed online (A) and at the door (D) at placement. */
  A: number
  D: number
  /** The order's `total` at placement (absent from entries kept before it was). */
  total?: number
  placedAt: string
  /** When this device kept it (epoch ms; absent from entries kept before it was). */
  savedAt?: number
}

const isGuestOrder = (value: unknown): value is GuestOrder =>
  isRecord(value) &&
  typeof value.orderCode === 'string' &&
  typeof value.linkToken === 'string' &&
  (value.expiresAt === null || typeof value.expiresAt === 'string') &&
  typeof value.A === 'number' &&
  typeof value.D === 'number' &&
  (value.total === undefined || typeof value.total === 'number') &&
  typeof value.placedAt === 'string' &&
  (value.savedAt === undefined || typeof value.savedAt === 'number')

/** Kept within the bound at `now` (an entry without a time: since its placement). */
const fresh = (order: GuestOrder, now: number) =>
  now - (order.savedAt ?? Date.parse(order.placedAt)) <= GUEST_ORDER_MAX_AGE_MS

/** The entry's own fields only (an older entry's `paymentUrl` goes). */
function entry(order: GuestOrder): GuestOrder {
  const { orderCode, linkToken, expiresAt, A, D, total, placedAt, savedAt } = order
  return {
    orderCode,
    linkToken,
    expiresAt,
    A,
    D,
    ...(total === undefined ? {} : { total }),
    placedAt,
    ...(savedAt === undefined ? {} : { savedAt }),
  }
}

export function readGuestOrders(now: number = Date.now()): GuestOrder[] {
  const stored = readJson('local', GUEST_ORDERS_KEY)
  if (!Array.isArray(stored)) return []
  return stored.filter(isGuestOrder).filter((order) => fresh(order, now)).map(entry)
}

/** Puts `order` first (the same code moves up, kept from now), keeping the last 10. */
export function saveGuestOrder(order: Omit<GuestOrder, 'savedAt'>): void {
  const others = readGuestOrders().filter((item) => item.orderCode !== order.orderCode)
  const kept = entry({ ...order, savedAt: Date.now() })
  writeJson('local', GUEST_ORDERS_KEY, [kept, ...others].slice(0, GUEST_ORDERS_MAX))
}

/** Drops the orders kept for longer than the bound (and an older entry's URL) from the storage. */
export function pruneGuestOrders(now: number = Date.now()): void {
  const stored = readJson('local', GUEST_ORDERS_KEY)
  if (!Array.isArray(stored)) return
  const kept = readGuestOrders(now)
  if (JSON.stringify(kept) !== JSON.stringify(stored)) writeJson('local', GUEST_ORDERS_KEY, kept)
}

export function findGuestOrder(code: string): GuestOrder | null {
  return readGuestOrders().find((item) => item.orderCode === code) ?? null
}

/** The order whose payment link holds `token`, or null. */
export function findGuestOrderByToken(token: string): GuestOrder | null {
  return readGuestOrders().find((item) => item.linkToken === token) ?? null
}

/** Forgets `code` on this device («حذف از این دستگاه»); false when the storage refused. */
export function removeGuestOrder(code: string): boolean {
  const kept = readGuestOrders().filter((item) => item.orderCode !== code)
  return writeJson('local', GUEST_ORDERS_KEY, kept)
}
