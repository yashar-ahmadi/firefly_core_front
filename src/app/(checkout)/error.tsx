'use client'

import dynamic from 'next/dynamic'
import { ErrorFallback } from '@/components/layout/error-fallback'
import type { ErrorBoundaryProps } from '@/components/layout/error-view'

/**
 * The error view, downloaded when this boundary shows (a server render that failed carries it
 * in its HTML), as the root boundary's (src/app/error.tsx): imported statically, it put 3.6 KB
 * gzip more on `/checkout/` (next/link, Button and icons in chunks of their own; Task 2 fix
 * round 1). Lazily, this boundary costs 0.8 KB: its own copy of the loader and of the plain
 * fallback, which Turbopack does not share with the root boundary's chunk (not even from one
 * module). A chunk that cannot load leaves that fallback, with a reload.
 */
const ErrorView = dynamic(() =>
  import('@/components/layout/error-view')
    .then((module) => module.ErrorView)
    .catch(() => ErrorFallback),
)

/** Errors in a checkout page: the message replaces the page, the quiet header and footer stay. */
export default function CheckoutError(props: ErrorBoundaryProps) {
  return <ErrorView {...props} />
}
