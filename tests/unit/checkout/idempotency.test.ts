import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensurePlacementKey } from '@/features/checkout/placement-key-reach'
import {
  clearPlacementKey,
  newIdempotencyKey,
  PLACEMENT_KEY_STORAGE,
  placementKey,
} from '@/features/checkout/idempotency'

// Idempotency keys (order digest §5.1, Plan 4 Global Constraints): a placement's key is created
// when the review is reached and kept in this tab's sessionStorage until a 2xx arrives, so a
// reload or a lost answer retries the same purchase; the next purchase gets a new one. Every
// payment intent gets a fresh key per click (`newIdempotencyKey`). A kept key sent with another
// cart is the API's to refuse (409 `order_idempotency_key_reused`, M-20): placed-again.test.tsx.

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

beforeEach(() => {
  sessionStorage.clear()
  clearPlacementKey()
})
afterEach(() => {
  vi.restoreAllMocks()
})

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

describe('the review reached', () => {
  it('makes this purchase’s key when the tab has none: the press sends it', () => {
    ensurePlacementKey()
    const key = sessionStorage.getItem(PLACEMENT_KEY_STORAGE)
    expect(key).toMatch(UUID)
    expect(placementKey()).toBe(key)
  })

  it('leaves a kept key as it is, however long ago it was made (until a 2xx)', () => {
    const key = placementKey()
    ensurePlacementKey()
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(key)
    expect(placementKey()).toBe(key)
  })
})
