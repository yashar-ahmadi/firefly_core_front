'use client'

import { useEffect, useState } from 'react'
import { readLink } from '../link-api'

// The card transfer's real cut-off (order digest §3.2.7, §5.7 step 2): the attempt closes at
// `open_attempt.expires_at` (the route's own lifetime), earlier than the order's deadline, which
// is all `card-transfer/` gives. It is read from the order's link page (`GET order/pay/<token>/`,
// one read, 30/min `order_payment_link`), whose token this device holds (the pending payment, a
// recent guest order) or, for the order's confirmed owner, comes from the order read for this
// account (`payment_url`, transfer-door.ts). Shown only for this very attempt. Without it, the
// order's deadline is shown, said as the order's.

export type Cutoff =
  /** This attempt's own cut-off. */
  | { kind: 'attempt'; at: string }
  /** Only the order's deadline is known. */
  | { kind: 'order'; at: string }
  | null

export interface CutoffInput {
  uuid: string
  /** The order's link token (null: not known here). */
  linkToken: string | null
  /** `card-transfer/`'s `expires_at`: the order's payment deadline. */
  orderDeadline: string | null
}

export function useAttemptCutoff({ uuid, linkToken, orderDeadline }: CutoffInput): Cutoff {
  const [attemptAt, setAttemptAt] = useState<{ uuid: string; at: string } | null>(null)

  useEffect(() => {
    if (!linkToken) return
    let live = true
    void readLink(linkToken)
      .then((read) => {
        const attempt = read.ok ? read.link.open_attempt : null
        if (live && attempt?.payment === uuid && attempt.expires_at)
          setAttemptAt({ uuid, at: attempt.expires_at })
      })
      .catch(() => {
        // No cut-off of the attempt's own: the order's deadline stays.
      })
    return () => {
      live = false
    }
  }, [uuid, linkToken])

  if (attemptAt?.uuid === uuid) return { kind: 'attempt', at: attemptAt.at }
  return orderDeadline ? { kind: 'order', at: orderDeadline } : null
}
