'use client'

import { ErrorView, type ErrorBoundaryProps } from '@/components/layout/error-view'

/** Errors in a shop page: the message replaces the page, the header and footer stay. */
export default function ShopError(props: ErrorBoundaryProps) {
  return <ErrorView {...props} />
}
