'use client'

import dynamic from 'next/dynamic'
import { useCallback, useEffect, useRef } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { Skeleton } from '@/components/ui/skeleton'
import { TrackLink } from '@/features/orders/track/track-link'
import { payLinkPath } from '@/features/orders/pay-link'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useSession } from '@/lib/session/session-context'
import type { CancelOutcome } from '../attempt-api'
import { getPending, removePending } from '../pending-payments'
import type { SupportLine } from '../result-actions'
import { ownOrderOf, useOrderOwnership } from '../use-order-ownership'
import { ReceiptOutcome } from './receipt-outcome'
import { HEADING_ID, PAGE_TITLE, UNDER_REVIEW_NO_CANCEL } from './transfer-copy'
import { TransferClosed } from './transfer-closed'
import { orderLinkToken } from './transfer-door'
import { TransferFormView } from './transfer-form-view'
import { TransferRefusal } from './transfer-refusal'
import { useTransferReads } from './use-transfer-reads'

// `/payment/card-transfer/<uuid>/` (order digest §5.7), the island: the cards read in the browser
// (use-transfer-reads.ts) and what follows from the payment's status. Pending: what to transfer
// and where (transfer-details.tsx), the receipt form, and «انصراف» before any receipt. Then the
// outcome (receipt-outcome.tsx), a closed attempt (a new one), or the calm page. Cancelled here:
// back to the order's route choice (its link page, a full load: its URL holds the token) when
// this device can find it. Whether the order is this account's is read once for the page
// (use-order-ownership.ts: a signed-in visitor answered with the session may still be paying a
// guest's order); only its confirmed owner is offered the account's pages and the owner's door.
// Each later view takes the focus on its heading and is said once, politely. The uuid is a
// credential: nothing here logs it.

// «کپی لینک این صفحه» is offered on one refusal only (another account's payment): its own chunk,
// fetched then, never on an ordinary visit. A chunk that cannot load leaves the address bar.
const CopyPageLink = dynamic(
  () => import('./copy-page-link').then((module) => module.CopyPageLink).catch(() => () => null),
  { ssr: false },
)

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
      <div className="grid gap-3 lg:grid-cols-2">
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
  const orderCode = status?.info.order_code ?? null
  // Not for a refused page: the calm page offers nothing that depends on the order's owner.
  const ownership = useOrderOwnership(
    orderCode,
    hasSession && !reads.foreign && phase.kind !== 'refused',
  )
  const own = ownOrderOf(ownership)
  const linkToken = orderLinkToken({ uuid, orderCode, own })
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

  function cancelled(outcome: CancelOutcome) {
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
    removePending(uuid)
    if (linkToken) return loadPage(payLinkPath(linkToken))
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
            renderTrack={(className, children) => (
              <TrackLink
                orderCode={orderCode ?? getPending(uuid)?.orderCode ?? null}
                className={className}
              >
                {children}
              </TrackLink>
            )}
            extra={phase.refusal.kind === 'forbidden' ? <CopyPageLink /> : null}
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
          linkToken={linkToken}
          support={support}
          headingRef={heading}
          onSent={sent}
          onSubmitted={() => go({ kind: 'outcome', notice: 'already' })}
          onClosed={() => go({ kind: 'closed' })}
          onRefused={(reason) =>
            go({ kind: 'refused', refusal: { kind: reason, retryAfter: null } })
          }
          reloadCards={reads.reloadCards}
          upload={reads.upload}
          onCancelled={cancelled}
        />
      ) : phase.kind === 'outcome' ? (
        <ReceiptOutcome
          uuid={uuid}
          initial={status}
          notice={phase.notice}
          ownership={ownership}
          support={support}
          headingRef={heading}
        />
      ) : (
        <TransferClosed
          uuid={uuid}
          orderCode={orderCode}
          ownership={ownership}
          support={support}
          headingRef={heading}
          ending={phase.kind === 'cancelled' || phase.kind === 'refunded' ? phase.kind : 'closed'}
        />
      )}
    </section>
  )
}
