'use client'

import { Button } from '@/components/ui/button'
import { Spinner } from '@/components/ui/spinner'
import { reloadPage } from '@/lib/navigation/hard-navigation'

// What stands in for an account page's lazily loaded overlay (a sheet, a dialog: loaded on the
// first press so the page's first load stays within the JS budget, P2-R4) while its code
// arrives (a panel opens on a press: the wait shows over the page), and when it cannot.

export function OverlayLoading() {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink-950/20">
      <Spinner size="lg" label="در حال آماده‌سازی" className="text-white" />
    </div>
  )
}

/** The code could not be downloaded (a stale chunk after a deploy, a dropped connection). */
export function OverlayUnavailable({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  if (!open) return null
  return (
    <div
      role="alert"
      className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-md flex-wrap items-center gap-3 rounded-card bg-white p-4 text-base text-danger shadow-raised"
    >
      <p className="w-full">این بخش بارگذاری نشد.</p>
      <Button variant="outline" size="sm" onClick={reloadPage}>
        بارگذاری دوباره صفحه
      </Button>
      <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
        بستن
      </Button>
    </div>
  )
}
