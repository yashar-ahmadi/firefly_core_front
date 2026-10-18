'use client'

import { useEffect, useEffectEvent, useState } from 'react'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { readLink } from '../link-api'
import { findLinkToken } from './transfer-door'

// The card transfer's real cut-off (order digest §3.2.7, §5.7 step 2): the attempt closes at
// `open_attempt.expires_at` (the route's own lifetime), earlier than the order's deadline, which
// is all `card-transfer/` gives. It is read from the order's link page (`GET order/pay/<token>/`,
// one read, 30/min `order_payment_link`), whose token this device holds (the pending payment, a
// recent guest order) or, for a signed-in owner, comes from the order (`payment_url`). Shown only
// for this very attempt. Without it, the order's deadline is shown, said as the order's.

export type Cutoff =
  /** This attempt's own cut-off. */
  | { kind: 'attempt'; at: string }
  /** Only the order's deadline is known. */
  | { kind: 'order'; at: string }
  | null

export interface CutoffInput {
  uuid: string
  orderCode: string | null
  owner: boolean
  /** `card-transfer/`'s `expires_at`: the order's payment deadline. */
  orderDeadline: string | null
}

export function useAttemptCutoff({ uuid, orderCode, owner, orderDeadline }: CutoffInput): Cutoff {
  const sessionGone = useEffectEvent(useSessionExpired())
  const [attemptAt, setAttemptAt] = useState<{ uuid: string; at: string } | null>(null)

  useEffect(() => {
    if (!orderCode) return
    let live = true
    void (async () => {
      try {
        const token = await findLinkToken({ uuid, orderCode, owner })
        if (!token || !live) return
        const read = await readLink(token)
        const attempt = read.ok ? read.link.open_attempt : null
        if (live && attempt?.payment === uuid && attempt.expires_at)
          setAttemptAt({ uuid, at: attempt.expires_at })
      } catch {
        // The owner's order could not be read because the session is gone.
        if (live) sessionGone()
      }
    })()
    return () => {
      live = false
    }
  }, [uuid, orderCode, owner])

  if (attemptAt?.uuid === uuid) return { kind: 'attempt', at: attemptAt.at }
  return orderDeadline ? { kind: 'order', at: orderDeadline } : null
}
