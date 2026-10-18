'use client'

import { CircleX } from 'lucide-react'
import type { Ref } from 'react'
import { Button } from '@/components/ui/button'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { formatToman, toPersianDigits } from '@/lib/format'
import { WithdrawalFacts, WithdrawalStatusPill } from './withdrawal-row'

// The one open withdrawal (order digest §7: `requested` or `approved`): its amount, status,
// account and when it is paid; «لغو درخواست» only while it is `requested` (an approved one is
// already at the bank). Its heading takes the focus when the request has just been filed (the
// form that had it is gone).

export function OpenWithdrawal({
  request,
  processingDays,
  onCancel,
  headingRef,
  cancelRef,
}: {
  request: WithdrawalRequest
  processingDays: number
  onCancel: () => void
  headingRef?: Ref<HTMLHeadingElement>
  cancelRef?: Ref<HTMLButtonElement>
}) {
  return (
    <section
      aria-labelledby="wallet-open-withdrawal-heading"
      className="flex flex-col gap-3 rounded-card border border-warning/40 bg-white p-4 shadow-card md:p-5"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2
          ref={headingRef}
          tabIndex={-1}
          id="wallet-open-withdrawal-heading"
          className="rounded-control text-lg leading-8 font-bold text-ink-900 outline-none focus-visible:ring-4 focus-visible:ring-(--focus)"
        >
          درخواست برداشت باز
        </h2>
        <WithdrawalStatusPill request={request} />
      </div>
      <p className="text-2xl leading-10 font-bold text-ink-900 tabular-nums">
        {formatToman(request.amount)}
      </p>
      <WithdrawalFacts request={request} />
      <p className="text-sm leading-6 text-ink-600">
        {`این مبلغ از موجودی کسر و کنار گذاشته شده است و حداکثر ظرف ${toPersianDigits(processingDays)} روز کاری بررسی و پرداخت می\u{200C}شود. تا یک درخواست باز دارید، درخواست تازه\u{200C}ای ثبت نمی\u{200C}شود.`}
      </p>
      {request.status === 'requested' && (
        <Button
          ref={cancelRef}
          variant="ghost"
          aria-haspopup="dialog"
          className="self-start text-danger hover:bg-danger/10"
          iconStart={<CircleX aria-hidden />}
          onClick={onCancel}
        >
          لغو درخواست
        </Button>
      )}
    </section>
  )
}
