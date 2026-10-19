'use client'

import { useQueryClient } from '@tanstack/react-query'
import { RefreshCw } from 'lucide-react'
import { useEffect, useRef, type Ref } from 'react'
import { Button } from '@/components/ui/button'
import { announce } from '@/components/ui/live-announcer'
import { Spinner } from '@/components/ui/spinner'
import { OrderCode } from '@/features/checkout/placed/order-code'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { removePending } from '../pending-payments'
import type { SupportLine } from '../result-actions'
import { ResultIcon } from '../result-icon'
import { ownOrderOf, type Ownership } from '../use-order-ownership'
import { usePaymentStatus } from '../use-payment-status'
import type { TransferStatus } from './card-transfer-api'
import { RejectionNote } from './rejection-note'
import { TransferActions, TransferActionsPlaceholder } from './transfer-actions'
import { TransferClosed } from './transfer-closed'
import * as T from './transfer-copy'
import { useCardAgain } from './use-card-again'
import type { OutcomeNotice } from './use-transfer-reads'

// The receipt's outcome (order digest §5.7 steps 4–5, §5.11): after the upload or on a later
// visit, the payment's status is read under the polling policy (usePaymentStatus: the shared
// 240/h budget, its slow tail, over at a final status, stopped after 15 minutes with «بررسی
// دوباره»); a status already final at the page's first read is not read again. Under review: the
// order cannot be paid or cancelled; its page or tracking. Approved (`settled`): the order is
// under way, the pending entry goes. Rejected (`failed` + `payment_receipt_rejected`): the order
// awaits payment again; its confirmed owner (its order read for this account, `ownership`) reads
// the reason (rejection-note.tsx), anyone else is told it came by SMS; «پرداخت دوباره» opens a
// NEW attempt. Anything else ended the attempt: closed. Changes after the first are said once,
// politely.

type Outcome = 'review' | 'approved' | 'rejected' | 'refunded' | 'closed'

const FINAL: ReadonlySet<string> = new Set(['settled', 'failed', 'cancelled', 'refunded'])

function outcomeOf(info: PaymentStatusInfo | null): Outcome {
  if (!info || info.status === 'awaiting_review' || info.status === 'pending') return 'review'
  if (info.status === 'settled') return 'approved'
  if (info.status === 'failed' && info.failure_reason === 'payment_receipt_rejected')
    return 'rejected'
  if (info.status === 'refunded') return 'refunded'
  return 'closed'
}

export interface ReceiptOutcomeProps {
  uuid: string
  /** The page's first status read (null: none could be read). */
  initial: TransferStatus | null
  notice: OutcomeNotice | null
  /** Whether the order is this account's (read once by the page). */
  ownership: Ownership
  /** The page's reads were answered only without the session: someone else's payment. */
  foreign: boolean
  support: SupportLine | null
  headingRef: Ref<HTMLHeadingElement>
}

const TITLE = 'text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10'

export function ReceiptOutcome({
  uuid,
  initial,
  notice,
  ownership,
  foreign,
  support,
  headingRef,
}: ReceiptOutcomeProps) {
  const client = useQueryClient()
  // Final already (approved, rejected, ended): the page's own read is all there is to know.
  // Someone else's payment (the page found out): read without the session from the first.
  const polled = usePaymentStatus(initial && FINAL.has(initial.info.status) ? null : uuid, {
    foreign,
  })
  const info = polled.info ?? initial?.info ?? null
  const own = ownOrderOf(ownership)
  const orderCode = info?.order_code ?? null
  const outcome = outcomeOf(info)
  const again = useCardAgain({ uuid, orderCode, own })

  const said = useRef<Outcome | null>(null)
  useEffect(() => {
    if (said.current !== null && said.current !== outcome) {
      announce(
        outcome === 'approved'
          ? T.APPROVED_TITLE
          : outcome === 'rejected'
            ? T.REJECTED_TITLE
            : outcome === 'refunded'
              ? T.REFUNDED_TITLE
              : T.CLOSED_TITLE,
      )
    }
    said.current = outcome
  }, [outcome])
  useEffect(() => {
    if (outcome !== 'approved') return
    removePending(uuid)
    void client.invalidateQueries({ queryKey: SUMMARY_KEY })
  }, [outcome, uuid, client])

  if (outcome === 'closed' || outcome === 'refunded') {
    return (
      <TransferClosed
        uuid={uuid}
        orderCode={orderCode}
        ownership={ownership}
        support={support}
        headingRef={headingRef}
        ending={outcome}
      />
    )
  }

  const title =
    outcome === 'approved'
      ? T.APPROVED_TITLE
      : outcome === 'rejected'
        ? T.REJECTED_TITLE
        : notice === 'already'
          ? T.ALREADY_SENT
          : T.RECEIPT_SENT
  return (
    <div className="flex flex-col items-start gap-5">
      <ResultIcon
        tone={outcome === 'approved' ? 'success' : outcome === 'rejected' ? 'error' : 'pending'}
      />
      <div className="flex flex-col gap-2">
        <h1 ref={headingRef} id={T.HEADING_ID} tabIndex={-1} className={TITLE}>
          {title}
        </h1>
        {outcome === 'review' && notice === 'under_review' && (
          <p className="text-base leading-8 font-medium text-ink-900">{T.UNDER_REVIEW_NO_CANCEL}</p>
        )}
        <p className="text-base leading-8 text-ink-800">
          {outcome === 'approved'
            ? T.approvedBody(orderCode)
            : outcome === 'rejected'
              ? T.REJECTED_BODY
              : T.REVIEW_BODY}
        </p>
        {outcome === 'review' && (
          <p className="text-sm leading-6 text-ink-600">
            {polled.stopped ? T.REVIEW_STOPPED : T.REVIEW_AUTO}
          </p>
        )}
      </div>
      {info && (
        <div className="flex flex-col gap-2">
          {orderCode && <OrderCode code={orderCode} />}
          <p className="text-base leading-7 text-ink-700">
            {'مبلغ: '}
            <span className="font-bold text-ink-900">{formatToman(info.amount)}</span>
          </p>
        </div>
      )}
      {outcome === 'review' && polled.stopped && (
        <Button
          variant="outline"
          aria-disabled={polled.reading || undefined}
          aria-busy={polled.reading || undefined}
          iconStart={polled.reading ? <Spinner /> : <RefreshCw aria-hidden />}
          onClick={polled.check}
        >
          بررسی دوباره
        </Button>
      )}
      {outcome === 'rejected' && (
        <RejectionNote uuid={uuid} owner={own !== null} pending={ownership.state === 'checking'} />
      )}
      {ownership.state === 'checking' ? (
        <TransferActionsPlaceholder />
      ) : (
        <TransferActions
          orderCode={orderCode}
          owner={own !== null}
          again={outcome === 'rejected' ? again : undefined}
          support={outcome === 'rejected' ? support : undefined}
        />
      )}
    </div>
  )
}
