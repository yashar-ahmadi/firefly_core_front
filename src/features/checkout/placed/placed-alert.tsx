import { CircleAlert } from 'lucide-react'
import Link from 'next/link'
import { SupportPhone } from '@/components/layout/support-phone'
import { buttonClasses } from '@/components/ui/button-styles'
import { payLinkPath } from '@/features/orders/pay-link'
import type { IntentError } from '@/features/payment/api'
import { BANK_UNUSABLE, intentMessage } from '@/features/payment/intent-messages'

// What happened to the placed order's payment (order digest §5.4–5.8, §8.3), as an alert: the
// refusal's sentence (the bank unusable here: with the support line), a handoff whose time ran
// out, an attempt still open the answer did not describe (its payment link), an order that cannot
// be paid any more (a new purchase).

export function PlacedAlert({
  error,
  bankGone,
  linkToken,
  supportPhone,
}: {
  /** null: the bank's handoff expired. */
  error: IntentError | null
  bankGone: boolean
  linkToken: string | null
  supportPhone: string | null
}) {
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-card bg-danger/10 px-4 py-3">
      <p className="flex items-start gap-2 text-base leading-7 font-medium text-ink-900">
        <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
        <span>
          {bankGone
            ? BANK_UNUSABLE
            : error
              ? intentMessage(error)
              : 'مهلت انتقال به درگاه تمام شد؛ دوباره پرداخت کنید.'}
        </span>
      </p>
      {bankGone && supportPhone && (
        <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
      )}
      {error?.problem === 'attempt_open' && linkToken && (
        // No attempt in the answer: the payment link's page reads it (a full page load).
        <a href={payLinkPath(linkToken)} className={buttonClasses({ variant: 'link' })}>
          ادامه یا لغو پرداخت نیمه‌تمام
        </a>
      )}
      {/* Past its deadline (or its link gone): this order cannot be paid; a new one can. */}
      {error?.problem === 'unpayable' && (
        <Link href="/" className={buttonClasses({ variant: 'link' })}>
          ادامهٔ خرید و ثبت سفارش تازه
        </Link>
      )}
    </div>
  )
}
