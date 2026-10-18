'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { reloadPage } from '@/lib/navigation/hard-navigation'

// The payment and review steps' own code loads when one of them shows, or earlier, as soon as
// the shopper works in the page (a pointer over it, a focus in it), one chunk for both: the
// checkout's first load carries only its first steps (the JS budget), and one chunk group
// keeps the shop's shared chunks as they are. A chunk that cannot load (a deploy since the page
// loaded, the connection) says so with a reload; the cart and the receiver's draft are kept.

// One request however often it is asked for (every pointer move over the page asks).
let loading: ReturnType<typeof importSteps> | null = null
const importSteps = () => import('./later-steps')
const load = () =>
  (loading ??= importSteps().catch((error: unknown) => {
    loading = null
    throw error
  }))
const loadPayment = () => load().then((module) => module.PaymentSection)
const loadReview = () => load().then((module) => module.ReviewSection)

/** Fetches both steps' code ahead of time. Never rejects. */
export function preloadLaterSteps(): void {
  void load().catch(() => undefined)
}

function StepLoading() {
  return (
    <div role="status" aria-label="در حال بارگذاری" className="flex flex-col gap-3">
      <Skeleton className="h-16 rounded-card" />
      <Skeleton className="h-16 rounded-card" />
    </div>
  )
}

function StepUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 text-base leading-7 text-ink-800"
    >
      <span>این بخش بارگذاری نشد.</span>
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

export const PaymentSection = dynamic(() => loadPayment().catch(() => StepUnavailable), {
  loading: StepLoading,
})

export const ReviewSection = dynamic(() => loadReview().catch(() => StepUnavailable), {
  loading: StepLoading,
})
