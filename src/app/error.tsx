'use client'

import { ErrorView, type ErrorBoundaryProps } from '@/components/layout/error-view'

/**
 * Errors outside the shop pages' own boundary (the shop layout itself, or pages without one).
 * This replaces everything under the root layout, so the message is centred on its own.
 */
export default function RootError(props: ErrorBoundaryProps) {
  return <ErrorView {...props} className="min-h-dvh justify-center" />
}
