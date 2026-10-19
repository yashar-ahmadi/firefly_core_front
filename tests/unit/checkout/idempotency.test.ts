import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  clearPlacementKey,
  newIdempotencyKey,
  PLACEMENT_KEY_MAX_AGE_MS,
  PLACEMENT_KEY_STORAGE,
  PLACEMENT_KEY_USED_STORAGE,
  placementKey,
} from '@/features/checkout/idempotency'

// Idempotency keys (order digest §5.1, Plan 4 Global Constraints): a placement's key is created
// when the review is reached and kept in this tab's sessionStorage until a 2xx arrives, so a
// reload or a lost answer retries the same purchase; the next purchase gets a new one. Every
// payment intent gets a fresh key per click (`newIdempotencyKey`). The kept key is bounded by
// age (Plan 4 final fix wave): one unused for longer than the placement's stock hold (30 minutes,
// digest §3.1.1) is a new purchase's, never replayed against another cart.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  sessionStorage.clear()
  clearPlacementKey()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

const MINUTE = 60_000
const T0 = Date.parse('2026-10-19T08:00:00Z')
/** The clock at `minutes` after T0. */
const at = (minutes: number) => vi.setSystemTime(T0 + minutes * MINUTE)

describe('idempotency keys', () => {
  it('a new key is a random UUID (≤ 64 characters)', () => {
    const key = newIdempotencyKey()
    expect(key).toMatch(UUID)
    expect(key.length).toBeLessThanOrEqual(64)
    expect(newIdempotencyKey()).not.toBe(key)
  })

  it('the placement key is kept until cleared (a lost answer, a reload), then a new one', () => {
    const first = placementKey()
    expect(first).toMatch(UUID)
    expect(placementKey()).toBe(first)
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(first)
    // A reload: the tab's storage still has it.
    expect(placementKey()).toBe(first)
    clearPlacementKey()
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBeNull()
    const next = placementKey()
    expect(next).not.toBe(first)
  })

  it('a stored value that is not a key is replaced', () => {
    sessionStorage.setItem(PLACEMENT_KEY_STORAGE, 'x'.repeat(65))
    expect(placementKey()).toMatch(UUID)
  })

  it('a storage that refuses keeps the key in memory for the tab', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    const key = placementKey()
    expect(placementKey()).toBe(key)
    clearPlacementKey()
    expect(placementKey()).not.toBe(key)
  })
})

describe('the placement key is bounded by age', () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ['Date'] }))

  it('the bound is the placement’s stock hold: 30 minutes', () => {
    expect(PLACEMENT_KEY_MAX_AGE_MS).toBe(30 * MINUTE)
  })

  it('unused for longer than the bound: a new purchase gets a new key (no replay of the old)', () => {
    at(0)
    const first = placementKey()
    at(31)
    const next = placementKey()
    expect(next).toMatch(UUID)
    expect(next).not.toBe(first)
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(next)
  })

  it('within the bound it is kept (a retry, a reload), and every use starts the bound again', () => {
    at(0)
    const key = placementKey()
    at(29)
    expect(placementKey()).toBe(key)
    // Used 29 minutes in: 58 minutes after it was made, it is still the same purchase's.
    at(58)
    expect(placementKey()).toBe(key)
    expect(sessionStorage.getItem(PLACEMENT_KEY_USED_STORAGE)).toBe(String(T0 + 58 * MINUTE))
    at(58 + 31)
    expect(placementKey()).not.toBe(key)
  })

  it('a key stored before the bound existed (no time with it) is kept, timed from now', () => {
    at(0)
    sessionStorage.setItem(PLACEMENT_KEY_STORAGE, 'legacy-key-0000')
    expect(placementKey()).toBe('legacy-key-0000')
    expect(sessionStorage.getItem(PLACEMENT_KEY_USED_STORAGE)).toBe(String(T0))
    at(31)
    expect(placementKey()).not.toBe('legacy-key-0000')
  })

  it('a 2xx forgets the key and its time', () => {
    at(0)
    placementKey()
    clearPlacementKey()
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBeNull()
    expect(sessionStorage.getItem(PLACEMENT_KEY_USED_STORAGE)).toBeNull()
  })

  it('a storage that refuses: the tab’s copy is bounded the same way', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError')
    })
    at(0)
    const key = placementKey()
    at(20)
    expect(placementKey()).toBe(key)
    at(51)
    expect(placementKey()).not.toBe(key)
  })
})
