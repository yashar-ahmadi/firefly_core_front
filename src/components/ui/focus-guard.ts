/**
 * Whether a swap of `container` may move the focus: it was inside it (the focused control goes
 * away with it) or nowhere (`<body>`). A focus anywhere else is the visitor's place: never taken.
 */
export function focusWasIn(container: Element | null): boolean {
  const active = document.activeElement
  return !active || active === document.body || (container?.contains(active) ?? false)
}
