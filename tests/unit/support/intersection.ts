// An IntersectionObserver whose entries the test decides (jsdom has none). Install it with
// `vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)`; components create their
// observers in effects, after that.

interface Registration {
  callback: IntersectionObserverCallback
  targets: Set<Element>
  options: IntersectionObserverInit | undefined
}

const registrations = new Set<Registration>()

export class FakeIntersectionObserver {
  private readonly registration: Registration

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.registration = { callback, targets: new Set(), options }
    registrations.add(this.registration)
  }

  observe(target: Element) {
    this.registration.targets.add(target)
  }

  unobserve(target: Element) {
    this.registration.targets.delete(target)
  }

  disconnect() {
    registrations.delete(this.registration)
  }

  takeRecords() {
    return []
  }
}

/** Tells every observer watching `targets` (all observed elements by default) that they cross. */
export function intersect(targets?: Element[], isIntersecting = true): void {
  for (const registration of [...registrations]) {
    const hit = [...registration.targets].filter((target) => !targets || targets.includes(target))
    if (hit.length === 0) continue
    const entries = hit.map((target) => ({ target, isIntersecting }) as IntersectionObserverEntry)
    registration.callback(entries, {} as IntersectionObserver)
  }
}

/** The options of the observers alive now. */
export function observerOptions(): (IntersectionObserverInit | undefined)[] {
  return [...registrations].map((registration) => registration.options)
}

export function resetIntersections(): void {
  registrations.clear()
}
