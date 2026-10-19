// An IntersectionObserver that follows the page's geometry, which jsdom has none of: each target's
// box (`getBoundingClientRect`) against the viewport (`window.innerHeight`) widened by the
// observer's `rootMargin` (its top and bottom, in px or %). Like a browser, it calls back once
// when a target is observed, then only for the targets whose intersection changed: after
// `relayout()` (the test moved the boxes: a scroll, a jump to the end, a scrollbar drag), a
// target that stayed on the same side of the band is never reported. Install it with
// `vi.stubGlobal('IntersectionObserver', LayoutIntersectionObserver)`.

const observers = new Set<LayoutIntersectionObserver>()

/** A `rootMargin` length: `12px`, `-70%` (of the viewport's height). */
function length(value: string, height: number): number {
  return value.endsWith('%') ? (Number.parseFloat(value) / 100) * height : Number.parseFloat(value)
}

/** The band the targets are tested against: the viewport, widened by the margins. */
function band(rootMargin: string): { top: number; bottom: number } {
  const height = window.innerHeight
  const [top = '0px', , bottom = top] = rootMargin.trim().split(/\s+/)
  return { top: -length(top, height), bottom: height + length(bottom, height) }
}

export class LayoutIntersectionObserver {
  private readonly states = new Map<Element, boolean>()

  constructor(
    private readonly callback: IntersectionObserverCallback,
    private readonly options: IntersectionObserverInit = {},
  ) {
    observers.add(this)
  }

  private intersects(target: Element): boolean {
    const box = target.getBoundingClientRect()
    const { top, bottom } = band(this.options.rootMargin ?? '0px')
    return box.bottom > top && box.top < bottom
  }

  private report(targets: Element[]) {
    if (targets.length === 0) return
    const entries = targets.map(
      (target) =>
        ({ target, isIntersecting: this.states.get(target) }) as IntersectionObserverEntry,
    )
    this.callback(entries, this as unknown as IntersectionObserver)
  }

  observe(target: Element) {
    this.states.set(target, this.intersects(target))
    this.report([target])
  }

  unobserve(target: Element) {
    this.states.delete(target)
  }

  disconnect() {
    this.states.clear()
    observers.delete(this)
  }

  takeRecords() {
    return []
  }

  /** Calls back for the targets whose side of the band changed since the last look. */
  relayout() {
    const changed = [...this.states.keys()].filter((target) => {
      const now = this.intersects(target)
      if (now === this.states.get(target)) return false
      this.states.set(target, now)
      return true
    })
    this.report(changed)
  }
}

/** The boxes moved (the test set new tops): every observer looks again. */
export function relayout(): void {
  for (const observer of [...observers]) observer.relayout()
}

/** Gives `element` a box `height` px tall whose top is `top()` px from the viewport's top. */
export function placeAt(element: Element, top: () => number, height = 32): void {
  element.getBoundingClientRect = () => {
    const at = top()
    return { top: at, bottom: at + height, height } as DOMRect
  }
}
