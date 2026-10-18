import { isRecord, readJson, writeJson } from '@/lib/store/json-storage'

// A guest's recent orders on this device (order digest §5.2 step 3; Plan 4 Global Constraints):
// the last 10 in localStorage (`ff-guest-orders`), newest first. Guest orders are never linked to
// an account, so this, the SMS and tracking by code and mobile are their only way back. The link
// token is a credential: it is kept here, never logged. A storage that refuses never throws.

export const GUEST_ORDERS_KEY = 'ff-guest-orders'
export const GUEST_ORDERS_MAX = 10

export interface GuestOrder {
  orderCode: string
  linkToken: string
  paymentUrl: string
  /** The payment deadline (ISO); null after a cancellation. */
  expiresAt: string | null
  /** Owed online (A) and at the door (D) at placement. */
  A: number
  D: number
  placedAt: string
}

const isGuestOrder = (value: unknown): value is GuestOrder =>
  isRecord(value) &&
  typeof value.orderCode === 'string' &&
  typeof value.linkToken === 'string' &&
  typeof value.paymentUrl === 'string' &&
  (value.expiresAt === null || typeof value.expiresAt === 'string') &&
  typeof value.A === 'number' &&
  typeof value.D === 'number' &&
  typeof value.placedAt === 'string'

export function readGuestOrders(): GuestOrder[] {
  const stored = readJson('local', GUEST_ORDERS_KEY)
  return Array.isArray(stored) ? stored.filter(isGuestOrder) : []
}

/** Puts `order` first (the same code moves up), keeping the last 10. */
export function saveGuestOrder(order: GuestOrder): void {
  const others = readGuestOrders().filter((item) => item.orderCode !== order.orderCode)
  writeJson('local', GUEST_ORDERS_KEY, [order, ...others].slice(0, GUEST_ORDERS_MAX))
}

export function findGuestOrder(code: string): GuestOrder | null {
  return readGuestOrders().find((item) => item.orderCode === code) ?? null
}
