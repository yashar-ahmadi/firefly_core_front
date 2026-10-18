'use client'

import { CircleCheck, House, Search, CircleX } from 'lucide-react'
import Link from 'next/link'
import { TrackLink } from '@/features/orders/track/track-link'
import { useEffect, useRef } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { formatToman, toPersianDigits } from '@/lib/format'
import type { LinkPaid } from './use-link-payment'

// What the payment link's page says once the shopper acted on it, from the server's answers
// only (order digest §5.5, §5.8, §3.1.10): a pay-on-delivery order confirmed (D at the door, or
// a free order), an order the wallet paid (the intent said `settled`), an order cancelled. The
// heading takes the focus; the ways on are tracking and the shop.

/** `settled`: the order's open attempt settled meanwhile (its verification ended well). */
export type LinkOutcome = LinkPaid | { kind: 'settled' } | { kind: 'cancelled' }

function copy(outcome: LinkOutcome, link: OrderPaymentLink): { title: string; body: string } {
  const code = toPersianDigits(link.order_code)
  switch (outcome.kind) {
    case 'confirmed':
      return {
        title: 'سفارش شما تأیید شد',
        body: outcome.free
          ? `سفارش ${code} تأیید شد و به\u{200C}زودی آماده\u{0654} ارسال می\u{200C}شود.`
          : `سفارش ${code} تأیید شد؛ مبلغ ${formatToman(link.amount_to_collect_on_delivery)} هنگام تحویل پرداخت می\u{200C}شود.`,
      }
    case 'paid':
      return {
        title: 'سفارش شما پرداخت شد',
        body: `پرداخت سفارش ${code} با کیف پول انجام شد و سفارش در حال پردازش است.`,
      }
    case 'settled':
      return {
        title: 'پرداخت سفارش انجام شد',
        body: `پرداخت سفارش ${code} ثبت شد و سفارش در حال پردازش است.`,
      }
    case 'cancelled':
      return {
        title: 'سفارش لغو شد',
        body: `سفارش ${code} لغو شد و دیگر قابل پرداخت نیست.`,
      }
  }
}

export function PayLinkDone({ outcome, link }: { outcome: LinkOutcome; link: OrderPaymentLink }) {
  const heading = useRef<HTMLHeadingElement>(null)
  useEffect(() => heading.current?.focus(), [])
  const { title, body } = copy(outcome, link)
  const Icon = outcome.kind === 'cancelled' ? CircleX : CircleCheck
  return (
    <section
      aria-labelledby="pay-link-heading"
      className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 rounded-card bg-white p-5 shadow-card md:p-8"
    >
      <h1
        ref={heading}
        id="pay-link-heading"
        tabIndex={-1}
        className="flex items-center gap-2 text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        <Icon
          aria-hidden
          className={cn(
            'size-6 shrink-0',
            outcome.kind === 'cancelled' ? 'text-ink-500' : 'text-success',
          )}
        />
        {title}
      </h1>
      <p className="text-base leading-7 text-ink-800">{body}</p>
      <div className="flex flex-wrap items-center gap-3">
        <TrackLink orderCode={link.order_code} className={buttonClasses({ variant: 'primary' })}>
          <Search aria-hidden />
          پیگیری سفارش
        </TrackLink>
        <Link href="/" className={buttonClasses({ variant: 'outline' })}>
          <House aria-hidden />
          صفحهٔ اصلی فروشگاه
        </Link>
      </div>
    </section>
  )
}
