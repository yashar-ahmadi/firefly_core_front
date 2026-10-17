'use client'

import dynamic from 'next/dynamic'
import { ErrorFallback } from '@/components/layout/error-fallback'
import type { ErrorBoundaryProps } from '@/components/layout/error-view'

/**
 * The error view, downloaded when this boundary shows (a server render that failed carries it
 * in its HTML). This boundary sits above the shop layout, so Turbopack builds its chunks without
 * the layout's: imported statically, the view (next/link, Button, icons) put a second copy of
 * that code on every page, about 6 KB gzip (Plan 4 Task 1, ruling P4-R2). A chunk that cannot
 * load leaves the plain fallback, with a reload.
 */
const ErrorView = dynamic(() =>
  import('@/components/layout/error-view')
    .then((module) => module.ErrorView)
    .catch(() => ErrorFallback),
)

/**
 * Errors outside the shop pages' own boundary (the shop layout itself, or pages without one).
 * This replaces everything under the root layout, so the message is centred on its own, in the
 * `<main id="main">` the root layout's skip link points to.
 */
export default function RootError(props: ErrorBoundaryProps) {
  return (
    <main id="main" tabIndex={-1} className="outline-none">
      <ErrorView {...props} className="min-h-dvh justify-center" />
    </main>
  )
}
