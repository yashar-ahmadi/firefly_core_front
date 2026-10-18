'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { isModifiedClick } from '@/lib/navigation/modified-click'
import { handOffOrderCode, orderCodeForToken } from './track-handoff'

// «پیگیری سفارش» from a page that knows the order: a plain link to `/order/track/` that hands the
// order's code over as it is pressed (track-handoff.ts), never in the URL. The code is given, or
// found by the payment link's token in this device's guest orders (a payment link's page knows
// only its token). Opened elsewhere (a new tab or window), it hands nothing.

export const TRACK_PATH = '/order/track/'

export interface TrackLinkProps {
  orderCode?: string | null
  /** A payment link's token: the order's code is looked up on this device. */
  linkToken?: string | null
  className?: string
  children: ReactNode
}

export function TrackLink({ orderCode, linkToken, className, children }: TrackLinkProps) {
  return (
    <Link
      href={TRACK_PATH}
      prefetch={false}
      className={className}
      onClick={(event) => {
        if (isModifiedClick(event)) return
        const code = orderCode ?? (linkToken ? orderCodeForToken(linkToken) : null)
        if (code) handOffOrderCode(code)
      }}
    >
      {children}
    </Link>
  )
}
