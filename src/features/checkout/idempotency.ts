import { readText, writeText } from '@/lib/store/json-storage'
import { PLACEMENT_KEY_STORAGE, PLACEMENT_KEY_USED_STORAGE } from './placement-key-reach'

export { PLACEMENT_KEY_STORAGE, PLACEMENT_KEY_USED_STORAGE }

// Idempotency keys (order digest §1.1, §5.1; Plan 4 Global Constraints). The placement's key is
// made when the review is reached (placement-key-reach.ts) and kept in this tab's sessionStorage
// until a 2xx arrives, so a reload or an answer lost on the way retries the same purchase (the
// server answers 200 with the order it placed); the next purchase gets a new one. Kept, within a
// bound: at the press, a key unused (not made, not sent) for longer than the placement's stock
// hold (`reservation_ttl_minutes`, 30 minutes by default, digest §3.1.1) is dropped for a new one.
// A lost answer is retried within moments; past the hold the order it may have placed holds no
// stock any more, and the next press is a new purchase, which the backend would otherwise answer
// with that earlier order (it matches a signed-in key alone, whatever the cart). Such an order is
// still in the account's orders. Every payment intent gets a new key per click
// (`newIdempotencyKey`), reused only for that click's automatic retries. Keys are never logged.

export const PLACEMENT_KEY_MAX_AGE_MS = 30 * 60_000

/** The API takes keys of at most 64 characters: a UUID is 36. */
const KEY = /^[\w-]{8,64}$/

interface KeptKey {
  key: string
  /** Null: kept from before the bound (timed from its next use). */
  usedAt: number | null
}

/** The key when the storage refuses (a private window): this tab's only copy. */
let memory: KeptKey | null = null

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** The stored key with its last use, else the tab's copy. */
function kept(): KeptKey | null {
  const stored = readText('session', PLACEMENT_KEY_STORAGE)
  if (stored && KEY.test(stored)) {
    const usedAt = Number(readText('session', PLACEMENT_KEY_USED_STORAGE))
    return { key: stored, usedAt: usedAt > 0 ? usedAt : null }
  }
  return memory && KEY.test(memory.key) ? memory : null
}

/** The key to send: the kept one used within the bound, or a new one; used now (the press). */
export function placementKey(): string {
  const now = Date.now()
  const found = kept()
  const key =
    found && now - (found.usedAt ?? now) <= PLACEMENT_KEY_MAX_AGE_MS
      ? found.key
      : newIdempotencyKey()
  // The tab's copy is kept (or made) and stored with its use, so a reload finds both.
  memory = { key, usedAt: now }
  writeText('session', PLACEMENT_KEY_STORAGE, key)
  writeText('session', PLACEMENT_KEY_USED_STORAGE, String(now))
  return key
}

/** A 2xx arrived: the next purchase gets a new key. */
export function clearPlacementKey(): void {
  memory = null
  writeText('session', PLACEMENT_KEY_STORAGE, null)
  writeText('session', PLACEMENT_KEY_USED_STORAGE, null)
}
