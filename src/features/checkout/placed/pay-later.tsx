'use client'

import { CalendarClock, ExternalLink, Search, UserRound } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/components/ui/cn'
import { Countdown } from '@/components/ui/countdown'
import { buttonClasses } from '@/components/ui/button-styles'
import { payLinkPath } from '@/features/orders/pay-link'
import { TrackLink } from '@/features/orders/track/track-link'
import { formatJalaliDateTime } from '@/lib/format/date-time'

// How to pay later (order digest §5.2 step 3, Plan 4 Global Constraints): a guest's order is
// never "in the account": its payment link, the deadline (and the time left), and tracking by
// the order code and mobile; a signed-in shopper's order is in «سفارش‌های من». The routes the
// links lead to are built by later tasks (Tasks 4, 7, 8): never prefetched.

export interface PayLaterProps {
  guest: boolean
  orderCode: string
  linkToken: string | null
  expiresAt: string | null
  /** Whether the order still owes something (the link and deadline are shown then). */
  payable: boolean
  className?: string
}

export function PayLater({
  guest,
  orderCode,
  linkToken,
  expiresAt,
  payable,
  className,
}: PayLaterProps) {
  if (!guest) {
    return (
      <div
        className={cn(
          'flex flex-col items-start gap-2 text-base leading-7 text-ink-700',
          className,
        )}
      >
        <p>
          این سفارش در حساب کاربری شما ثبت شده است؛ وضعیت و پرداخت آن را از «سفارش‌های من» ببینید.
        </p>
        <Link
          href={`/account/orders/${orderCode}/`}
          prefetch={false}
          className={buttonClasses({ variant: 'outline', size: 'sm' })}
        >
          <UserRound aria-hidden />
          مشاهدهٔ سفارش در حساب کاربری
        </Link>
      </div>
    )
  }
  return (
    <div
      className={cn('flex flex-col items-start gap-3 text-base leading-7 text-ink-700', className)}
    >
      {payable && linkToken && (
        <>
          <p>
            تا پایان مهلت پرداخت، این سفارش را با لینک پرداخت آن هم می‌توانید پرداخت کنید؛ این لینک
            با پیامک هم برایتان فرستاده می‌شود.
          </p>
          {/* A full page load (its URL holds the token): credential-routes.ts. */}
          <a
            href={payLinkPath(linkToken)}
            className={buttonClasses({ variant: 'outline', size: 'sm' })}
          >
            <ExternalLink aria-hidden />
            لینک پرداخت سفارش
          </a>
          {expiresAt && (
            <p className="flex flex-wrap items-center gap-x-2">
              <CalendarClock aria-hidden className="size-5 text-ink-500" />
              <span>
                {'مهلت پرداخت: '}
                <time dateTime={expiresAt}>{formatJalaliDateTime(expiresAt)}</time>
              </span>
              <span className="text-ink-600">
                (<Countdown endsAt={expiresAt} className="tabular-nums" /> مانده)
              </span>
            </p>
          )}
        </>
      )}
      <TrackLink orderCode={orderCode} className={buttonClasses({ variant: 'link' })}>
        <Search aria-hidden />
        پیگیری سفارش با کد سفارش و شمارهٔ موبایل
      </TrackLink>
    </div>
  )
}
