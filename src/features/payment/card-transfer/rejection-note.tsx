'use client'

import { MessageSquareText } from 'lucide-react'
import { REJECTED_GUEST, REJECTED_REASON, REJECTION_LABELS } from './transfer-copy'
import { useRejectionReason } from './use-rejection-reason'

// Why the receipt was turned down (order digest §5.7 step 5): its signed-in owner reads the
// code and the sentence the shop sent (`GET payment/history/<uuid>/`); a guest, or an owner whose
// detail could not be read, is told honestly that the reason came by SMS, with the support line
// beside it (TransferActions).

export function RejectionNote({ uuid, owner }: { uuid: string; owner: boolean }) {
  const reason = useRejectionReason(uuid, owner)
  const box = 'flex w-full items-start gap-3 rounded-card bg-ink-50 p-4 text-base leading-7'
  if (reason.state === 'read') {
    const label = reason.code ? REJECTION_LABELS[reason.code] : null
    return (
      <div className={box}>
        <MessageSquareText aria-hidden className="mt-1 size-5 shrink-0 text-ink-500" />
        <div className="flex flex-col gap-1">
          <p className="font-medium text-ink-900">
            {REJECTED_REASON} {label ?? ''}
          </p>
          {reason.text && <p className="text-ink-800">{reason.text}</p>}
        </div>
      </div>
    )
  }
  return (
    <div className={box} aria-busy={reason.state === 'loading' || undefined}>
      <MessageSquareText aria-hidden className="mt-1 size-5 shrink-0 text-ink-500" />
      <p className="text-ink-800">
        {reason.state === 'loading' ? 'دلیل رد رسید در حال خواندن است…' : REJECTED_GUEST}
      </p>
    </div>
  )
}
