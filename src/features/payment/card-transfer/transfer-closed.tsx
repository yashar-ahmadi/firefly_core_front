'use client'

import type { Ref } from 'react'
import { ResultIcon } from '../result-icon'
import type { SupportLine } from '../result-actions'
import { CANCELLED_TITLE, CLOSED_BODY, CLOSED_TITLE, HEADING_ID } from './transfer-copy'
import { TransferActions } from './transfer-actions'
import { useCardAgain } from './use-card-again'

// A card transfer that is no longer open (order digest §3.2.7–3.2.8: `payment_target_invalid`;
// or its status ended without a receipt: cancelled, expired), or one the shopper just cancelled
// here when this device knows no route choice to go back to: said plainly, with «پرداخت دوباره»
// (a new attempt, a new key) when a door is known, another route, and the support line (money
// may already have been sent).

export interface TransferClosedProps {
  uuid: string
  orderCode: string | null
  owner: boolean
  support: SupportLine | null
  headingRef: Ref<HTMLHeadingElement>
  /** Cancelled here, a moment ago. */
  cancelled?: boolean
}

export function TransferClosed({
  uuid,
  orderCode,
  owner,
  support,
  headingRef,
  cancelled = false,
}: TransferClosedProps) {
  const again = useCardAgain({ uuid, orderCode, owner })
  return (
    <div className="flex flex-col items-start gap-5">
      <ResultIcon tone="info" />
      <div className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          id={HEADING_ID}
          tabIndex={-1}
          className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
        >
          {cancelled ? CANCELLED_TITLE : CLOSED_TITLE}
        </h1>
        <p className="text-base leading-8 text-ink-800">
          {cancelled
            ? 'این پرداخت کارت به کارت بسته شد. برای پرداخت سفارش، پرداخت تازه\u{200C}ای آغاز کنید یا روش دیگری انتخاب کنید.'
            : CLOSED_BODY}
        </p>
      </div>
      <TransferActions orderCode={orderCode} owner={owner} again={again} support={support} />
    </div>
  )
}
