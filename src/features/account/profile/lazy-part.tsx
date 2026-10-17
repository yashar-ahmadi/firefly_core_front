'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { reloadPage } from '@/lib/navigation/hard-navigation'

// The profile's forms that open on a press (a contact change, two-step login's setup and
// disable, the logout-everywhere dialog) load their code then, or earlier when the pointer
// comes near or the focus reaches their button: the page's first load stays within the JS
// budget (P2-R4). These stand in while the code arrives, and when it cannot.

/** While a part's code arrives (its first opening only). */
export function PartLoading() {
  return (
    <div className="grid min-h-24 place-items-center">
      <Spinner size="lg" label="در حال آماده‌سازی فرم" className="text-brand-600" />
    </div>
  )
}

/**
 * Stands in for a part whose code could not be downloaded (a stale chunk after a deploy, a
 * dropped connection): says so in place, with a reload for fresh code. The rest of the page (and
 * its error boundary) is untouched.
 */
export function PartUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 rounded-control bg-danger/10 px-4 py-3 text-base text-danger"
    >
      <p>فرم بارگذاری نشد.</p>
      <Button variant="outline" size="sm" onClick={reloadPage}>
        بارگذاری دوباره صفحه
      </Button>
    </div>
  )
}
