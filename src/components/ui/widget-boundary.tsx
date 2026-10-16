'use client'

import { Component, type ReactNode } from 'react'

export interface WidgetBoundaryProps {
  /** Names the widget in the log line. */
  name: string
  /** Shown in place of the widget once it failed; nothing by default. */
  fallback?: ReactNode
  /** Told once the widget failed, e.g. so its trigger stops opening it. */
  onError?: (error: unknown) => void
  children: ReactNode
}

/**
 * Keeps a render error inside one page-wide widget (quick view, the compare bar, the mini-cart,
 * the search box): the widget is replaced by `fallback` (nothing by default) and the error is
 * logged, while the shop around it goes on. Without it, the error would climb to the route's
 * error boundary and replace the whole page with the error view. It stays down until the
 * widget is mounted again (a full page load); a render bug would only throw again.
 */
export class WidgetBoundary extends Component<WidgetBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    console.error(`Widget "${this.props.name}" failed to render and was taken off the page.`, error)
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
