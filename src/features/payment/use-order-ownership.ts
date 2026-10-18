'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { readOwnOrder, type OwnOrder } from './order-lookup'

// Whether a payment's order is this account's (order digest §3.1.3, §11 #7). Being answered with
// the session is not ownership: the backend checks the owner only when the payment has one
// (payment/services/access.py), so a signed-in visitor paying a GUEST order through its link reads
// its status with the session too. The account's order pages, the owner's door (the order's uuid)
// and the owner-only reads are offered only once `GET order/<code>/` answered for this account:
// read once per page, for a signed-in visitor whose payment answered with the session
// (`candidate`). Not this account's (404), or no answer: `other` (tracking, or the order's link).
// A session found gone ends it (the page turns into a guest's).

export type Ownership =
  /** The order is being read. */
  | { state: 'checking' }
  | { state: 'own'; order: OwnOrder }
  /** Not this account's order, or it could not be confirmed. */
  | { state: 'other' }

const CHECKING: Ownership = { state: 'checking' }
const OTHER: Ownership = { state: 'other' }

/** The confirmed owner's order, or null. */
export const ownOrderOf = (ownership: Ownership): OwnOrder | null =>
  ownership.state === 'own' ? ownership.order : null

export function useOrderOwnership(orderCode: string | null, candidate: boolean): Ownership {
  const sessionGone = useEffectEvent(useSessionExpired())
  const [read, setRead] = useState<{ code: string; value: Ownership } | null>(null)
  const asked = candidate && orderCode !== null

  useEffect(() => {
    if (!asked || !orderCode) return
    const controller = new AbortController()
    readOwnOrder(orderCode, controller.signal).then(
      (order) => setRead({ code: orderCode, value: { state: 'own', order } }),
      (error: unknown) => {
        if (controller.signal.aborted) return
        if (isSessionExpiredError(error)) sessionGone()
        setRead({ code: orderCode, value: OTHER })
      },
    )
    return () => controller.abort()
  }, [asked, orderCode])

  if (!asked) return OTHER
  return read?.code === orderCode ? read.value : CHECKING
}
