import type { Ref } from 'react'
import { Badge } from '@/components/ui/badge'
import type { WithdrawalRequest } from '@/lib/api/types/wallet'
import { formatJalaliDate, formatToman, toPersianDigits } from '@/lib/format'
import { groupCard, shownSheba } from './bank-account'
import { labelOf, WITHDRAWAL_STATUSES, WITHDRAWAL_TONES } from './wallet-labels'

// One withdrawal request (order digest §2, §7): the amount, its status as a pill (the API's
// words; the colour never speaks alone), when it was filed, the account (bank, sheba and card,
// left to right); a paid one's bank reference and date, a rejected one's reason.

export const withdrawalRowId = (uuid: string) => `withdrawal-${uuid}`

export function WithdrawalStatusPill({ request }: { request: WithdrawalRequest }) {
  return (
    <Badge tone={WITHDRAWAL_TONES[request.status] ?? 'neutral'}>
      {labelOf(WITHDRAWAL_STATUSES, request.status, request.status_display)}
    </Badge>
  )
}

export function WithdrawalFacts({ request }: { request: WithdrawalRequest }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-0.5 text-sm leading-6">
      <dt className="text-ink-600">ثبت</dt>
      <dd className="text-ink-800">
        <time dateTime={request.created}>{formatJalaliDate(request.created)}</time>
      </dd>
      {request.bank_name && (
        <>
          <dt className="text-ink-600">بانک</dt>
          <dd className="text-ink-800">{request.bank_name}</dd>
        </>
      )}
      <dt className="text-ink-600">شبا</dt>
      <dd>
        <bdi dir="ltr" className="text-ink-900 tabular-nums">
          {shownSheba(request.iban)}
        </bdi>
      </dd>
      {request.card_number && (
        <>
          <dt className="text-ink-600">کارت</dt>
          <dd>
            <bdi dir="ltr" className="text-ink-900 tabular-nums">
              {groupCard(request.card_number)}
            </bdi>
          </dd>
        </>
      )}
      <dt className="text-ink-600">صاحب حساب</dt>
      <dd className="text-ink-800">{request.account_holder_name}</dd>
      {request.status === 'paid' && request.payout_reference && (
        <>
          <dt className="text-ink-600">شمارهٔ پیگیری واریز</dt>
          <dd>
            <bdi dir="ltr" className="text-ink-900 tabular-nums">
              {toPersianDigits(request.payout_reference)}
            </bdi>
          </dd>
        </>
      )}
      {request.status === 'paid' && request.paid_at && (
        <>
          <dt className="text-ink-600">تاریخ واریز</dt>
          <dd className="text-ink-800">
            <time dateTime={request.paid_at}>{formatJalaliDate(request.paid_at)}</time>
          </dd>
        </>
      )}
      {request.status === 'rejected' && request.rejection_reason.trim() && (
        <>
          <dt className="text-ink-600">دلیل رد</dt>
          <dd className="text-ink-800">{request.rejection_reason}</dd>
        </>
      )}
    </dl>
  )
}

export function WithdrawalRow({
  request,
  focusRef,
}: {
  request: WithdrawalRequest
  /** The row a ledger link points at (it takes the focus). */
  focusRef?: Ref<HTMLDivElement>
}) {
  return (
    <div
      id={withdrawalRowId(request.uuid)}
      ref={focusRef}
      tabIndex={focusRef ? -1 : undefined}
      className="flex flex-col gap-2 rounded-control outline-none focus-visible:ring-4 focus-visible:ring-(--focus)"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base leading-7 font-bold text-ink-900">{formatToman(request.amount)}</p>
        <WithdrawalStatusPill request={request} />
      </div>
      <WithdrawalFacts request={request} />
    </div>
  )
}
