'use client'

import dynamic from 'next/dynamic'
import { buttonClasses } from '@/components/ui/button-styles'
import { Spinner } from '@/components/ui/spinner'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { OpenAttemptProps } from './open-attempt'

// The open-attempt resume UI (open-attempt.tsx) is its own chunk: the checkout loads it only on
// a `409 payment_attempt_open`, the payment link's page only when its order has an open attempt,
// so neither pays for it otherwise (the JS budget). A chunk that cannot load (a deploy since the
// page loaded, the connection) says so where the panel would be, with a reload, and, when the
// host has one, the order's payment link (a full page load: its URL holds the token).

export interface OpenAttemptLoaderProps extends OpenAttemptProps {
  /** Where the attempt can be handled when this code cannot load (the payment link's page). */
  fallbackHref?: string
}

function AttemptUnavailable({ fallbackHref }: OpenAttemptLoaderProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800"
    >
      <span>یک پرداخت نیمه‌تمام برای این سفارش باز است، ولی این بخش بارگذاری نشد.</span>
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reloadPage}
          className={buttonClasses({ variant: 'outline', size: 'sm' })}
        >
          بارگذاری دوباره
        </button>
        {fallbackHref && (
          <a href={fallbackHref} className={buttonClasses({ variant: 'link' })}>
            ادامه یا لغو پرداخت نیمه‌تمام
          </a>
        )}
      </div>
    </div>
  )
}

export const OpenAttemptLoader = dynamic<OpenAttemptLoaderProps>(
  () =>
    import('./open-attempt').then((module) => module.OpenAttempt).catch(() => AttemptUnavailable),
  {
    loading: () => (
      <p role="status" className="flex items-center gap-2 text-base leading-7 text-ink-700">
        <Spinner aria-hidden />
        در حال خواندن پرداخت نیمه‌تمام…
      </p>
    ),
  },
)
