// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const { MISSING_MAX_ENTRIES, MISSING_TTL_MS, clearMissing, isKnownMissing, rememberMissing } =
  await import('@/features/catalog/loaders/missing')

afterEach(() => clearMissing())

describe('remembered 404s (negative LRU)', () => {
  it('keeps a key for 60 seconds', () => {
    expect(MISSING_TTL_MS).toBe(60_000)
    rememberMissing('product/detail/a/', 1_000)
    expect(isKnownMissing('product/detail/a/', 1_000)).toBe(true)
    expect(isKnownMissing('product/detail/a/', 60_999)).toBe(true)
    expect(isKnownMissing('product/detail/a/', 61_000)).toBe(false)
    expect(isKnownMissing('product/detail/a/', 1_000)).toBe(false)
  })

  it('holds at most 500 keys, dropping the least recently used', () => {
    expect(MISSING_MAX_ENTRIES).toBe(500)
    for (let i = 0; i < 500; i++) rememberMissing(`k${i}`, 0)
    // Touching k0 makes k1 the least recently used.
    expect(isKnownMissing('k0', 0)).toBe(true)
    rememberMissing('k500', 0)
    expect(isKnownMissing('k1', 0)).toBe(false)
    expect(isKnownMissing('k0', 0)).toBe(true)
    expect(isKnownMissing('k2', 0)).toBe(true)
    expect(isKnownMissing('k500', 0)).toBe(true)
  })
})
