import { CircleAlert, Clock, House, RefreshCw, Search } from 'lucide-react'
import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { toPersianDigits } from '@/lib/format/digits'
import type { SupportLine } from '../result-actions'
import { HEADING_ID } from './transfer-copy'
import { SupportNote } from './support-note'
import type { TransferRefusal as Refusal, TransferRefusalKind } from './use-transfer-reads'

// The card-transfer page when it cannot show the payment (order digest §3.2.7: 404, 403; a
// wait; no answer): a calm page, never an error screen, with what to do next (the order's
// tracking, the shop, the support line) and, for a wait or a lost answer, a read again. Also the
// segment's not-found page (a uuid of the wrong shape), rendered on the server, with no retry: it
// takes no client component of its own (each one would load on every visit of the route, the
// JS budget), so the island hands in its tracking link (`renderTrack`: TrackLink, the order's
// code handed over) and what more it offers (`extra`: a copy of the page's link, for another
// account's payment); the server's page has a plain link to tracking.

const COPY: Record<TransferRefusalKind, { title: string; body: string }> = {
  not_found: {
    title: 'این پرداخت پیدا نشد',
    body: 'این لینک پرداخت کارت به کارت معتبر نیست یا دیگر وجود ندارد. سفارش خود را از «پیگیری سفارش» پیدا کنید یا با پشتیبانی تماس بگیرید.',
  },
  forbidden: {
    title: 'این پرداخت از حساب کاربری دیگری است',
    body: 'این پرداخت از حساب کاربری دیگری آغاز شده است و با این حساب نمایش داده نمی\u{200C}شود. این صفحه را بدون ورود به حساب کاربری (مثلاً در پنجره\u{0654} ناشناس مرورگر) باز کنید یا با پشتیبانی تماس بگیرید.',
  },
  throttled: { title: 'کمی صبر کنید', body: 'لطفاً کمی بعد دوباره تلاش کنید.' },
  unavailable: {
    title: 'اطلاعات پرداخت خوانده نشد',
    body: 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.',
  },
}

export const NOT_FOUND_TITLE = COPY.not_found.title

const plainTrack = (className: string, children: ReactNode) => (
  <Link href="/order/track/" prefetch={false} className={className}>
    {children}
  </Link>
)

export interface TransferRefusalProps {
  refusal: Refusal
  support: SupportLine | null
  headingRef?: Ref<HTMLHeadingElement>
  /** Read the payment again (a wait, no answer); omitted, no such offer. */
  onRetry?: () => void
  /** The link to tracking, made by the island (by default a plain link). */
  renderTrack?: (className: string, children: ReactNode) => ReactNode
  /** More to offer, from the island. */
  extra?: ReactNode
}

export function TransferRefusal({
  refusal,
  support,
  headingRef,
  onRetry,
  renderTrack,
  extra,
}: TransferRefusalProps) {
  const copy = COPY[refusal.kind]
  const waiting = refusal.kind === 'throttled'
  const retry = onRetry && (waiting || refusal.kind === 'unavailable')
  const Icon = waiting ? Clock : CircleAlert
  return (
    <div className="flex flex-col items-start gap-4">
      <h1
        ref={headingRef}
        id={HEADING_ID}
        tabIndex={-1}
        className="flex items-start gap-2 text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        <Icon
          aria-hidden
          // On the first line of a title that wraps.
          className={cn(
            'mt-1.5 size-6 shrink-0 md:mt-2',
            waiting ? 'text-ink-500' : 'text-warning',
          )}
        />
        {copy.title}
      </h1>
      <p className="text-base leading-7 text-ink-800">
        {waiting && refusal.retryAfter
          ? `حدود ${toPersianDigits(refusal.retryAfter)} ثانیه دیگر دوباره تلاش کنید.`
          : copy.body}
      </p>
      <div className="flex flex-wrap items-center gap-3">
        {retry && (
          <button type="button" onClick={onRetry} className={buttonClasses({ variant: 'primary' })}>
            <RefreshCw aria-hidden />
            تلاش دوباره
          </button>
        )}
        {(renderTrack ?? plainTrack)(
          buttonClasses({ variant: retry ? 'outline' : 'primary' }),
          <>
            <Search aria-hidden />
            پیگیری سفارش
          </>,
        )}
        <Link href="/" className={buttonClasses({ variant: 'outline' })}>
          <House aria-hidden />
          صفحهٔ اصلی فروشگاه
        </Link>
        {extra}
      </div>
      <div className="self-stretch border-t border-ink-100 pt-4">
        <SupportNote support={support} />
      </div>
    </div>
  )
}
