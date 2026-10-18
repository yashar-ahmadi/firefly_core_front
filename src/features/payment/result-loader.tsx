'use client'

import dynamic from 'next/dynamic'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { PaymentResultPageProps } from './result-page'

// The payment result page's island (result-page.tsx) as its own chunk, rendered on the server
// as well (its first words, «در حال بررسی…», with no flash): the route's entry stays a thin
// wrapper, as the payment link's does, so the new route moves the shop's shared chunks as little
// as possible (the JS budget; see docs/ARCHITECTURE.md). A chunk that cannot load says so with a
// reload (the page reads the payment again from this tab's copy).

function PageUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-center gap-3 text-base leading-7 text-ink-800"
    >
      <span>این صفحه بارگذاری نشد.</span>
      <button
        type="button"
        onClick={reloadPage}
        className="h-11 rounded-control border border-ink-300 bg-white px-4 font-medium text-ink-800 hover:bg-ink-50"
      >
        بارگذاری دوباره
      </button>
    </div>
  )
}

export const PaymentResult = dynamic<PaymentResultPageProps>(() =>
  import('./result-page').then((module) => module.PaymentResultPage).catch(() => PageUnavailable),
)
