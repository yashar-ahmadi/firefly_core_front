'use client'

import { Component, type ReactNode } from 'react'

export interface WidgetBoundaryProps {
  /** Names the widget (for whoever reads the tree in React DevTools). */
  name: string
  /** Shown in place of the widget once it failed; nothing by default. */
  fallback?: ReactNode
  /** Told once the widget failed, e.g. so its trigger stops opening it. */
  onError?: (error: unknown) => void
  children: ReactNode
}

/**
 * Keeps a render error inside one page-wide widget (quick view, the compare bar, the mini-cart,
 * the search box): the widget is replaced by `fallback` (nothing by default) and `onError` is
 * told, while the shop around it goes on. Without it, the error would climb to the route's
 * error boundary and replace the whole page with the error view. It stays down until the
 * widget is mounted again (a full page load); a render bug would only throw again.
 *
 * Logging: the boundary writes nothing itself. React reports every error a boundary catches
 * (in development with the failed component and this boundary named), and in production
 * Next's `onCaughtError` logs it with `console.error`: one report per error, never two.
 */
export class WidgetBoundary extends Component<WidgetBoundaryProps, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  componentDidCatch(error: unknown) {
    this.props.onError?.(error)
  }

  render() {
    return this.state.failed ? (this.props.fallback ?? null) : this.props.children
  }
}
