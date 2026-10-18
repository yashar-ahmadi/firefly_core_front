'use client'

import { useState, type Ref } from 'react'
import type { CardTransferInstruction } from '@/lib/api/types/payment'
import type { CancelOutcome } from '../attempt-api'
import type { SupportLine } from '../result-actions'
import { CancelTransfer } from './cancel-transfer'
import { ReceiptForm } from './receipt-form'
import { SupportNote } from './support-note'
import { HEADING_ID, LEAD, NO_CARDS, PAGE_TITLE } from './transfer-copy'
import { TransferDetails } from './transfer-details'
import { useAttemptCutoff } from './use-attempt-cutoff'
import type { ReceiptHandlers } from './use-receipt-submit'

// The open card transfer (order digest §5.7 steps 2–3, 6): what to transfer and where, the receipt
// form, and «انصراف» before any receipt (held while one is on its way). The attempt's own cut-off
// is read here, for the form only (use-attempt-cutoff.ts: no link-page read on the other views).
// A shop with no active card left (deactivated since the attempt opened) gets no form: the
// support line and «انصراف».

export interface TransferFormViewProps extends ReceiptHandlers {
  uuid: string
  data: CardTransferInstruction
  /** The server's sanitised instruction (null: none; undefined: not known there). */
  instruction: string | null | undefined
  orderCode: string | null
  /** The order's link token, when known (the attempt's own cut-off is read from its page). */
  linkToken: string | null
  support: SupportLine | null
  headingRef: Ref<HTMLHeadingElement>
  onCancelled: (outcome: CancelOutcome) => void
}

export function TransferFormView({
  uuid,
  data,
  instruction,
  orderCode,
  linkToken,
  support,
  headingRef,
  onCancelled,
  ...handlers
}: TransferFormViewProps) {
  const [uploading, setUploading] = useState(false)
  const cutoff = useAttemptCutoff({ uuid, linkToken, orderDeadline: data.expires_at })
  const noCards = data.destination_cards.length === 0
  return (
    <>
      <div className="flex flex-col gap-2">
        <h1
          ref={headingRef}
          id={HEADING_ID}
          tabIndex={-1}
          className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
        >
          {PAGE_TITLE}
        </h1>
        <p className="text-base leading-8 text-ink-700">{LEAD}</p>
      </div>
      <TransferDetails
        data={data}
        orderCode={orderCode}
        cutoff={cutoff}
        instruction={instruction}
      />
      {noCards ? (
        <div role="alert" className="flex flex-col gap-2 rounded-card bg-warning/10 p-4">
          <p className="text-base leading-7 font-medium text-ink-900">{NO_CARDS}</p>
          <SupportNote support={support} />
        </div>
      ) : (
        <ReceiptForm cards={data.destination_cards} onBusyChange={setUploading} {...handlers} />
      )}
      <CancelTransfer uuid={uuid} held={uploading} onDone={onCancelled} />
    </>
  )
}
