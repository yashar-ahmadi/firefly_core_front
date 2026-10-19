import { readText, writeText } from '@/lib/store/json-storage'

// The placement key made when the review is reached (Plan 4 Global Constraints; order digest §5.1
// step 2): this purchase's key, made and stored now with its time if the tab has none. The rest
// of the key's life is idempotency.ts's, at the press: kept until a 2xx, replaced when unused for
// longer than the stock hold, the tab's own copy when the storage refuses. Kept apart so the
// review's chunk carries only this (the checkout's JS budget). Never throws.

export const PLACEMENT_KEY_STORAGE = 'ff-checkout-placement-key'
/** When the stored key was last used (made, sent): epoch milliseconds. */
export const PLACEMENT_KEY_USED_STORAGE = 'ff-checkout-placement-key-used'

export function ensurePlacementKey(): void {
  if (readText('session', PLACEMENT_KEY_STORAGE) !== null) return
  if (writeText('session', PLACEMENT_KEY_STORAGE, crypto.randomUUID()))
    writeText('session', PLACEMENT_KEY_USED_STORAGE, String(Date.now()))
}
