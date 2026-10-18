'use client'

import { useMemo, useSyncExternalStore } from 'react'
import { readText } from '@/lib/store/json-storage'
import {
  GUEST_ORDERS_KEY,
  readGuestOrders,
  removeGuestOrder,
  type GuestOrder,
} from '../guest-orders'

// This device's recent guest orders (`ff-guest-orders`), read after hydration only (the server has
// no storage: the first render is empty, as the server's HTML was), kept in step with a removal
// here and with another tab's writes (`storage` events). Without storage: none, never an error.

const listeners = new Set<() => void>()

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

export interface GuestOrders {
  orders: GuestOrder[]
  /** Forgets one order on this device; false when the storage refused. */
  remove: (orderCode: string) => boolean
}

export function useGuestOrders(): GuestOrders {
  const text = useSyncExternalStore(
    subscribe,
    () => readText('local', GUEST_ORDERS_KEY),
    () => null,
  )
  const orders = useMemo(() => (text ? readGuestOrders() : []), [text])
  return {
    orders,
    remove: (orderCode) => {
      const removed = removeGuestOrder(orderCode)
      if (removed) listeners.forEach((listener) => listener())
      return removed
    },
  }
}
