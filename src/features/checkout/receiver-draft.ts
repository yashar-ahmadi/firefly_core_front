// A guest's receiver while they check out (Plan 4 Task 2): kept in this tab's sessionStorage so
// a reload loses nothing, never anywhere else (no cookie, no URL, no log). It is forgotten once
// the order is placed (Task 3) and on any login or logout (the next visitor of this tab must
// not see it): the login hand-off, the logout and the session sweep call `clearReceiverDraft`,
// which is why this module holds nothing else. The checkout reads it as an external store
// (`useSyncExternalStore`: nothing of it on the server). sessionStorage can be missing or refuse
// (a private window, a full quota): the tab then keeps the draft in memory, and nothing here
// ever throws. The values are checked field by field where they are read (`receiverFrom`).

export const RECEIVER_DRAFT_KEY = 'ff-checkout-receiver'

export interface StoredReceiverDraft {
  /** As stored: read it through `receiverFrom`. */
  values: unknown
  /** «ادامه» was pressed with these values (the step is done while the cart agrees). */
  confirmed: boolean
}

const listeners = new Set<() => void>()
/** The draft when the storage refused it (`inMemory`): this tab's only copy. */
let memory: string | null = null
let inMemory = false

function changed() {
  for (const listener of listeners) listener()
}

export function subscribeReceiverDraft(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The stored text, as it is (a string: the same value until the draft changes). */
export function receiverDraftSnapshot(): string | null {
  if (inMemory) return memory
  try {
    return sessionStorage.getItem(RECEIVER_DRAFT_KEY)
  } catch {
    inMemory = true
    return memory
  }
}

/** A stored text as a draft; anything else is none. */
export function parseReceiverDraft(raw: string | null): StoredReceiverDraft | null {
  if (!raw) return null
  try {
    const draft = JSON.parse(raw) as { values?: unknown; confirmed?: unknown } | null
    if (typeof draft !== 'object' || draft === null) return null
    return { values: draft.values, confirmed: draft.confirmed === true }
  } catch {
    return null
  }
}

export function readReceiverDraft(): StoredReceiverDraft | null {
  return parseReceiverDraft(receiverDraftSnapshot())
}

function store(text: string | null): void {
  memory = text
  try {
    if (text === null) sessionStorage.removeItem(RECEIVER_DRAFT_KEY)
    else sessionStorage.setItem(RECEIVER_DRAFT_KEY, text)
  } catch {
    inMemory = true
  }
  changed()
}

export function saveReceiverDraft(draft: StoredReceiverDraft): void {
  store(JSON.stringify(draft))
}

export function clearReceiverDraft(): void {
  if (receiverDraftSnapshot() !== null) store(null)
}
