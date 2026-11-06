import { readText, writeText } from '@/lib/store/json-storage'
import { PLACEMENT_KEY_STORAGE } from './placement-key-reach'

export { PLACEMENT_KEY_STORAGE }

// Idempotency keys (order digest §1.1, §5.1; Plan 4 Global Constraints). The placement's key is
// made when the review is reached (placement-key-reach.ts) and kept in this tab's sessionStorage
// until a 2xx arrives, so a reload or an answer lost on the way retries the same purchase (the
// server answers 200 with the order it placed); the next purchase gets a new one. A kept key the
// server already placed an order with, sent with another cart that has goods in it (a 2xx lost,
// then a new purchase in this tab), places nothing: 409 `order_idempotency_key_reused`, and
// place-flow sends the same request once more with a new key (M-20). Every payment intent gets a
// new key per click (`newIdempotencyKey`), reused only for that click's automatic retries. Keys
// are never logged.

/** The API takes keys of at most 64 characters: a UUID is 36. */
const KEY = /^[\w-]{8,64}$/

/** The key when the storage refuses (a private window): this tab's only copy. */
let memory: string | null = null

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** The key to send: the kept one, or a new one, kept now (the press). */
export function placementKey(): string {
  const stored = readText('session', PLACEMENT_KEY_STORAGE)
  const key =
    stored && KEY.test(stored) ? stored : memory && KEY.test(memory) ? memory : newIdempotencyKey()
  // The tab's copy is kept (or made) and stored, so a reload finds it.
  memory = key
  writeText('session', PLACEMENT_KEY_STORAGE, key)
  return key
}

/** A 2xx arrived (or the key cannot be sent again): the next placement gets a new key. */
export function clearPlacementKey(): void {
  memory = null
  writeText('session', PLACEMENT_KEY_STORAGE, null)
}
