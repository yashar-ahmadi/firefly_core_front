import { CircleAlert, Clock, House, Search } from 'lucide-react'
import Link from 'next/link'
import { SupportPhone } from '@/components/layout/support-phone'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { toPersianDigits } from '@/lib/format'
import { REFUSAL_COPY, type LinkRefusal } from './link-refusal'

// The payment link's page when it does not open (order digest §3.1.9, §8.2): a calm page, never
// an error screen. What happened (our title, the API's sentence, our note) and what to do next:
// the order's tracking by code and mobile, the support line, the shop; a wait or a lost answer
// offers the page again (a full page load: its URL holds the token). Rendered on the server for
// the first read and in the browser after a later one, so it has no state of its own.

export interface PayLinkRefusalProps {
  refusal: LinkRefusal
  supportPhone: string | null
  /** The page again (a wait, no answer); omitted, no such offer. */
  retryHref?: string
}

export function PayLinkRefusal({ refusal, supportPhone, retryHref }: PayLinkRefusalProps) {
  const copy = REFUSAL_COPY[refusal.kind]
  const waiting = refusal.kind === 'throttled'
  const Icon = waiting ? Clock : CircleAlert
  return (
    <section
      aria-labelledby="pay-link-heading"
      className="mx-auto flex w-full max-w-2xl flex-col items-start gap-4 rounded-card bg-white p-5 shadow-card md:p-8"
    >
      <h1
        id="pay-link-heading"
        tabIndex={-1}
        className="flex items-center gap-2 text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
      >
        <Icon
          aria-hidden
          className={cn('size-6 shrink-0', waiting ? 'text-ink-500' : 'text-warning')}
        />
        {copy.title}
      </h1>
      {waiting && refusal.retryAfter !== null ? (
        <p className="text-base leading-7 text-ink-800">
          {`حدود ${toPersianDigits(refusal.retryAfter)} ثانیه دیگر دوباره تلاش کنید.`}
        </p>
      ) : (
        copy.detail &&
        refusal.detail && <p className="text-base leading-7 text-ink-800">{refusal.detail}</p>
      )}
      {copy.note && <p className="text-base leading-7 text-ink-700">{copy.note}</p>}
      <div className="flex flex-wrap items-center gap-3">
        {copy.retry && retryHref && (
          <a href={retryHref} className={buttonClasses({ variant: 'primary' })}>
            تلاش دوباره
          </a>
        )}
        <Link
          href="/order/track/"
          prefetch={false}
          className={buttonClasses({ variant: copy.retry ? 'outline' : 'primary' })}
        >
          <Search aria-hidden />
          پیگیری سفارش
        </Link>
        <Link href="/" className={buttonClasses({ variant: 'outline' })}>
          <House aria-hidden />
          صفحهٔ اصلی فروشگاه
        </Link>
      </div>
      {supportPhone && (
        <div className="flex flex-wrap items-center gap-2 self-stretch border-t border-ink-100 pt-4 text-base leading-7 text-ink-700">
          <span>پرسشی دارید؟</span>
          <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
        </div>
      )}
    </section>
  )
}
