'use client'

import { useCallback, useEffect, useRef } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { Skeleton } from '@/components/ui/skeleton'
import { payLinkPath } from '@/features/orders/pay-link'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useSession } from '@/lib/session/session-context'
import type { CancelOutcome } from '../attempt-api'
import { removePending } from '../pending-payments'
import type { SupportLine } from '../result-actions'
import { ReceiptOutcome } from './receipt-outcome'
import { HEADING_ID, PAGE_TITLE, UNDER_REVIEW_NO_CANCEL } from './transfer-copy'
import { TransferClosed } from './transfer-closed'
import { TransferFormView } from './transfer-form-view'
import { findLinkToken } from './transfer-door'
import { TransferRefusal } from './transfer-refusal'
import { useAttemptCutoff } from './use-attempt-cutoff'
import { useTransferReads } from './use-transfer-reads'

// `/payment/card-transfer/<uuid>/` (order digest §5.7), the island: the cards read in the browser
// (use-transfer-reads.ts) and what follows from the payment's status. Pending: what to transfer
// and where (transfer-details.tsx), the receipt form, and «انصراف» before any receipt. Then the
// outcome (receipt-outcome.tsx), a closed attempt (a new one), or the calm page. Cancelled here:
// back to the order's route choice (its link page, a full load: its URL holds the token) when
// this device can find it. Each later view takes the focus on its heading and is said once,
// politely. The uuid is a credential: nothing here logs it.

export interface CardTransferPageProps {
  uuid: string
  /** The route's instruction, sanitised on the server (null: none; undefined: not known). */
  instruction: string | null | undefined
  support: SupportLine | null
}

function Loading() {
  return (
    <div aria-busy className="flex flex-col gap-4" role="status">
      <span className="sr-only">در حال خواندن اطلاعات پرداخت…</span>
      <Skeleton className="h-28 w-full rounded-card" />
      <div className="grid gap-3 md:grid-cols-2">
        <Skeleton className="h-56 w-full rounded-card" />
        <Skeleton className="h-56 w-full rounded-card" />
      </div>
    </div>
  )
}

export function CardTransferPage({ uuid, instruction, support }: CardTransferPageProps) {
  const reads = useTransferReads(uuid)
  const { phase, status } = reads
  const { hasSession } = useSession()
  const owner = hasSession && !(status?.foreign ?? false)
  const orderCode = status?.info.order_code ?? null
  const cutoff = useAttemptCutoff({
    uuid,
    orderCode,
    owner,
    orderDeadline: reads.instruction?.expires_at ?? null,
  })
  const heading = useRef<HTMLHeadingElement>(null)

  // A view that replaces another after the first takes the focus on its heading.
  const shown = useRef<string | null>(null)
  useEffect(() => {
    if (phase.kind === 'loading') return
    if (shown.current !== null && shown.current !== phase.kind) heading.current?.focus()
    shown.current = phase.kind
  }, [phase.kind])

  const { go } = reads
  // Said by its heading, which takes the focus (never by the live region as well).
  const sent = useCallback(() => go({ kind: 'outcome', notice: 'sent' }), [go])

  async function cancelled(outcome: CancelOutcome) {
    if (!outcome.ok) {
      if (outcome.problem === 'under_review') {
        announce(UNDER_REVIEW_NO_CANCEL)
        return go({ kind: 'outcome', notice: 'under_review' })
      }
      return go({ kind: 'closed' })
    }
    if (outcome.status === 'settled') return go({ kind: 'outcome', notice: null })
    // Back to the order's route choice, when this device can find the order's link; the
    // cancelled attempt's pending entry goes (its uuid leads nowhere now).
    const token = await findLinkToken({ uuid, orderCode, owner }).catch(() => null)
    removePending(uuid)
    if (token) return loadPage(payLinkPath(token))
    go({ kind: 'cancelled' })
  }

  const frame =
    'mx-auto flex w-full max-w-3xl flex-col gap-6 rounded-card bg-white p-5 shadow-card md:p-8'
  if (phase.kind === 'loading' || phase.kind === 'refused') {
    return (
      <section aria-labelledby={HEADING_ID} className={frame}>
        {phase.kind === 'loading' ? (
          <>
            <h1 id={HEADING_ID} className="text-xl leading-9 font-bold text-ink-900">
              {PAGE_TITLE}
            </h1>
            <Loading />
          </>
        ) : (
          <TransferRefusal
            refusal={phase.refusal}
            support={support}
            headingRef={heading}
            onRetry={reads.retry}
          />
        )}
      </section>
    )
  }

  return (
    <section aria-labelledby={HEADING_ID} className={frame}>
      {phase.kind === 'form' && reads.instruction ? (
        <TransferFormView
          uuid={uuid}
          data={reads.instruction}
          instruction={instruction}
          orderCode={orderCode}
          cutoff={cutoff}
          support={support}
          headingRef={heading}
          onSent={sent}
          onSubmitted={() => go({ kind: 'outcome', notice: 'already' })}
          onClosed={() => go({ kind: 'closed' })}
          onRefused={(reason) =>
            go({ kind: 'refused', refusal: { kind: reason, retryAfter: null } })
          }
          reloadCards={reads.reloadCards}
          onCancelled={(outcome) => void cancelled(outcome)}
        />
      ) : phase.kind === 'outcome' ? (
        <ReceiptOutcome
          uuid={uuid}
          initial={status}
          notice={phase.notice}
          support={support}
          headingRef={heading}
        />
      ) : (
        <TransferClosed
          uuid={uuid}
          orderCode={orderCode}
          owner={owner}
          support={support}
          headingRef={heading}
          cancelled={phase.kind === 'cancelled'}
        />
      )}
    </section>
  )
}
