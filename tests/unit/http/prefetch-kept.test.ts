import { describe, expect, it } from 'vitest'
import { isQuietPrefetch } from '@/lib/http/prefetch'
import shapes from '../../fixtures/browser-prefetch-shapes.json'

// Which document prefetches the proxy may leave "quiet" (no redirect lookup, no session refresh;
// Plan 4 final fix wave): only those a browser never shows on the click. A kept one is shown
// instead of a visit, so it needs what a visit gets. Pinned to what Chromium really does under
// the storefront's `no-store` pages (tests/fixtures/browser-prefetch-shapes.json, captured).

type Captured = {
  prefetch: Record<string, string | null>
  keptAndShownOnClick: boolean
}
const captured = shapes.captured as Record<string, Captured>
const headersOf = (sent: Record<string, string | null>) =>
  new Headers(Object.entries(sent).filter((pair): pair is [string, string] => pair[1] !== null))

describe('a document prefetch is quiet only if the browser never keeps it', () => {
  it('captured with the storefront’s own Cache-Control (no-store)', () => {
    expect(shapes.cacheControl).toMatch(/\bno-store\b/)
  })

  it.each(Object.entries(captured))('%s: kept ⇒ not quiet', (_, shape) => {
    if (shape.keptAndShownOnClick) expect(isQuietPrefetch(headersOf(shape.prefetch))).toBe(false)
  })

  it('the speculation-rules prefetch is the kept one, and it says `Sec-Purpose`', () => {
    expect(captured.speculationRules!.keptAndShownOnClick).toBe(true)
    expect(captured.speculationRules!.prefetch['sec-purpose']).toBe('prefetch')
  })

  it('`<link rel=prefetch>` is never kept under no-store; its older `Purpose` spelling may be quiet', () => {
    expect(captured.linkPrefetch!.keptAndShownOnClick).toBe(false)
    expect(shapes.legacyPurposeHeader.keptUnderNoStore).toBe(false)
    expect(isQuietPrefetch(new Headers({ purpose: 'prefetch' }))).toBe(true)
  })

  it('both headers at once (Chromium’s move to `Sec-Purpose`, a prefetch ahead of a prerender): kept, not quiet', () => {
    const both = shapes.transitionBothHeaders
    expect(both.keptAndShownOnClick).toBe(true)
    expect(both.headers.purpose).toBe('prefetch')
    expect(isQuietPrefetch(new Headers(both.headers))).toBe(false)
  })
})
