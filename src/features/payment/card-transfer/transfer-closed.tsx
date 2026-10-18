'use client'

import type { Ref } from 'react'
import { ResultIcon } from '../result-icon'
import type { SupportLine } from '../result-actions'
import { ownOrderOf, type Ownership } from '../use-order-ownership'
import * as T from './transfer-copy'
import { TransferActions, TransferActionsPlaceholder } from './transfer-actions'
import { useCardAgain } from './use-card-again'

// A card transfer that is no longer open (order digest §3.2.7–3.2.8: `payment_target_invalid`;
// or its status ended without a receipt: cancelled, expired), or one the shopper just cancelled
// here when this device knows no route choice to go back to: said plainly, with «پرداخت دوباره»
// (a new attempt, a new key) when a door is known, another route, and the support line (money
// may already have been sent). A refunded payment (the shop gave the money back) is said as that,
// with the order and the support line and nothing to pay again.

export interface TransferClosedProps {
  uuid: string
  orderCode: string | null
  /** Whether the order is this account's (read once by the page). */
  ownership: Ownership
  support: SupportLine | null
  headingRef: Ref<HTMLHeadingElement>
  /** How it ended: closed, cancelled here a moment ago, or refunded by the shop. */
  ending?: TransferEnding
}

export type TransferEnding = 'closed' | 'cancelled' | 'refunded'

const COPY: Record<TransferEnding, { title: string; body: string }> = {
  closed: { title: T.CLOSED_TITLE, body: T.CLOSED_BODY },
  cancelled: { title: T.CANCELLED_TITLE, body: T.CANCELLED_BODY },
  refunded: { title: T.REFUNDED_TITLE, body: T.REFUNDED_BODY },
}

export function TransferClosed({
  uuid,
  orderCode,
  ownership,
  support,
  headingRef,
  ending = 'closed',
}: TransferClosedProps) {
  const own = ownOrderOf(ownership)
  const again = useCardAgain({ uuid, orderCode, own })
  const copy = COPY[ending]
  return (
    <div className="flex flex-col items-start gap-5">
      <ResultIcon tone="info" />
      <div className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          id={T.HEADING_ID}
          tabIndex={-1}
          className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
        >
          {copy.title}
        </h1>
        <p className="text-base leading-8 text-ink-800">{copy.body}</p>
      </div>
      {ownership.state === 'checking' ? (
        <TransferActionsPlaceholder />
      ) : (
        <TransferActions
          orderCode={orderCode}
          owner={own !== null}
          // Refunded: the money came back; there is nothing to pay again from here.
          again={ending === 'refunded' ? undefined : again}
          support={support}
        />
      )}
    </div>
  )
}
