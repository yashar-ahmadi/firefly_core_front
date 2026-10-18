import { readText, writeText } from '@/lib/store/json-storage'

// Idempotency keys (order digest §1.1, §5.1; Plan 4 Global Constraints). The placement's key is
// made when the review is reached and kept in this tab's sessionStorage until a 2xx arrives, so
// a reload or an answer lost on the way retries the same purchase (the server answers 200 with
// the order it placed); the next purchase gets a new one. Every payment intent gets a new key
// per click (`newIdempotencyKey`), reused only for that click's automatic retries. Keys are
// never logged.

export const PLACEMENT_KEY_STORAGE = 'ff-checkout-placement-key'

/** The API takes keys of at most 64 characters: a UUID is 36. */
const KEY = /^[\w-]{8,64}$/

/** The key when the storage refuses (a private window): this tab's only copy. */
let memory: string | null = null

export function newIdempotencyKey(): string {
  return crypto.randomUUID()
}

/** This purchase's placement key: the stored one, or a new one stored now. */
export function placementKey(): string {
  const stored = readText('session', PLACEMENT_KEY_STORAGE)
  const key = stored && KEY.test(stored) ? stored : memory && KEY.test(memory) ? memory : null
  if (key && key === stored) {
    memory = key
    return key
  }
  // The tab's copy is kept (or made) and stored, so a reload finds it.
  const next = key ?? newIdempotencyKey()
  memory = next
  writeText('session', PLACEMENT_KEY_STORAGE, next)
  return next
}

/** A 2xx arrived: the next purchase gets a new key. */
export function clearPlacementKey(): void {
  memory = null
  writeText('session', PLACEMENT_KEY_STORAGE, null)
}
