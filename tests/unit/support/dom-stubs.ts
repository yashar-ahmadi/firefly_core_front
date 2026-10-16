import { vi } from 'vitest'

// Browser APIs jsdom lacks but overlays and carousels use: matchMedia (useMediaQuery),
// ResizeObserver (Radix popper, Embla), IntersectionObserver (Embla) and pointer capture
// (Vaul's drag).

type Matcher = (query: string) => boolean

class NoopObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return []
  }
}

/**
 * Installs the stubs and returns a controller for `matchMedia`: `set(matcher)` decides which
 * queries match and notifies every subscribed list, like a viewport resize would.
 */
export function stubBrowserApis(initial: Matcher = () => false) {
  let matcher = initial
  const listeners = new Set<() => void>()

  const pointerCapture = {
    setPointerCapture: () => {},
    releasePointerCapture: () => {},
    hasPointerCapture: () => false,
  }
  for (const [name, stub] of Object.entries(pointerCapture)) {
    if (typeof Reflect.get(Element.prototype, name) !== 'function') {
      Reflect.set(Element.prototype, name, stub)
    }
  }
  vi.stubGlobal('ResizeObserver', NoopObserver)
  vi.stubGlobal('IntersectionObserver', NoopObserver)
  vi.stubGlobal('matchMedia', (query: string) => ({
    media: query,
    get matches() {
      return matcher(query)
    },
    onchange: null,
    addEventListener: (_type: string, listener: () => void) => listeners.add(listener),
    removeEventListener: (_type: string, listener: () => void) => listeners.delete(listener),
    addListener: (listener: () => void) => listeners.add(listener),
    removeListener: (listener: () => void) => listeners.delete(listener),
    dispatchEvent: () => true,
  }))

  return {
    set(next: Matcher) {
      matcher = next
      for (const listener of [...listeners]) listener()
    },
  }
}

/** A matcher for "the viewport is at least `rem` wide" (Tailwind breakpoints are in rem). */
export const minWidth =
  (rem: number): Matcher =>
  (query) =>
    query === `(min-width: ${rem}rem)`

/** The focused element (for `toContainElement` and friends). */
export function focusedElement(): HTMLElement {
  return document.activeElement as HTMLElement
}
