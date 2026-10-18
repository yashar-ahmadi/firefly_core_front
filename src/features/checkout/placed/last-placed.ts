import { isRecord, readJson } from '@/lib/store/json-storage'

// The order last placed in this tab (`ff-checkout-placed`, written by placed-order.ts), as the
// checkout needs it when it is opened again with the cart that order emptied (a reload, Back
// from the bank): its code only, and only while it is recent (`savedAt`, written with it, within
// `RECENT_MS`): an old record never stands in for «سبد خرید شما خالی است». Kept apart so the
// checkout's first load does not carry the rest of placed-order.ts. Never throws.

export const PLACED_KEY = 'ff-checkout-placed'
/** How long after the record was last written the empty checkout still shows its order. */
export const RECENT_MS = 30 * 60_000

export interface LastPlaced {
  orderCode: string
}

export function readLastPlaced(now = Date.now()): LastPlaced | null {
  const stored = readJson('session', PLACED_KEY)
  if (!isRecord(stored) || typeof stored.orderCode !== 'string') return null
  const { orderCode, savedAt } = stored
  const recent = typeof savedAt === 'number' && now - savedAt >= 0 && now - savedAt <= RECENT_MS
  return recent && /^\d{10}$/.test(orderCode) ? { orderCode } : null
}
