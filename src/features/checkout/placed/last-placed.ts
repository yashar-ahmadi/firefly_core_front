import { isRecord, readJson } from '@/lib/store/json-storage'

// The order last placed in this tab (`ff-checkout-placed`, written by placed-order.ts), as the
// checkout needs it when it is opened again with the cart that order emptied (a reload, Back
// from the bank): its code only. Kept apart so the checkout's first load does not carry the
// rest of placed-order.ts. Never throws.

export const PLACED_KEY = 'ff-checkout-placed'

export interface LastPlaced {
  orderCode: string
}

export function readLastPlaced(): LastPlaced | null {
  const stored = readJson('session', PLACED_KEY)
  if (!isRecord(stored) || typeof stored.orderCode !== 'string') return null
  return /^\d{10}$/.test(stored.orderCode) ? { orderCode: stored.orderCode } : null
}
