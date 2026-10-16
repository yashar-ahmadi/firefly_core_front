/**
 * Moves the focus to `element` and scrolls it to the middle of the viewport, never under the
 * sticky header and section bars at the top or the phone's buy bar at the bottom (the browser's
 * own focus scrolling stops at the very edge). Instant: no animation to reduce. No-op on null.
 */
export function focusInView(element: HTMLElement | null | undefined): void {
  if (!element) return
  element.focus({ preventScroll: true })
  // jsdom has no scrollIntoView.
  if (typeof element.scrollIntoView === 'function') element.scrollIntoView({ block: 'center' })
}
