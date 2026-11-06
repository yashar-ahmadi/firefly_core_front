import { readText, writeText } from '@/lib/store/json-storage'

// The placement key made when the review is reached (Plan 4 Global Constraints; order digest §5.1
// step 2): this purchase's key, made and stored now if the tab has none. The rest of the key's
// life is idempotency.ts's, at the press: kept until a 2xx, the tab's own copy when the storage
// refuses. Kept apart so the review's chunk carries only this (the checkout's JS budget). Never
// throws.

export const PLACEMENT_KEY_STORAGE = 'ff-checkout-placement-key'

export function ensurePlacementKey(): void {
  if (readText('session', PLACEMENT_KEY_STORAGE) !== null) return
  writeText('session', PLACEMENT_KEY_STORAGE, crypto.randomUUID())
}
