import type { PaymentRoute } from '@/lib/api/types/payment'
import { isRecord, readJson, writeJson } from '@/lib/store/json-storage'

// What the result page needs to find its way back after the bank (Plan 4 Global Constraints;
// order digest §5.4 step 3): saved in localStorage BEFORE the browser leaves for the bank, by
// payment uuid (`ff-pending-payments`), since the status endpoint returns neither the link token
// nor the order uuid and a guest has no history. Entries older than 7 days are dropped. A uuid
// and a link token are bearer credentials: they stay in this store, never in a log.

export const PENDING_KEY = 'ff-pending-payments'
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PendingPayment {
  kind: 'order' | 'topup'
  orderCode?: string
  /** The signed-in door (`payment/order/<uuid>/intent/`). */
  orderUuid?: string
  /** The link door (`payment/link/<token>/intent/`). */
  linkToken?: string
  route: PaymentRoute
  /** What this attempt charges (the bank's part of a wallet-and-gateway payment). */
  amount: number
  /** Epoch milliseconds. */
  startedAt: number
}

const isPending = (value: unknown): value is PendingPayment =>
  isRecord(value) &&
  (value.kind === 'order' || value.kind === 'topup') &&
  typeof value.route === 'string' &&
  typeof value.amount === 'number' &&
  typeof value.startedAt === 'number'

function readAll(): Record<string, PendingPayment> {
  const stored = readJson('local', PENDING_KEY)
  if (!isRecord(stored)) return {}
  return Object.fromEntries(
    Object.entries(stored).filter(([, value]) => isPending(value)),
  ) as Record<string, PendingPayment>
}

const fresh = (entries: Record<string, PendingPayment>, now: number) =>
  Object.fromEntries(
    Object.entries(entries).filter(([, entry]) => now - entry.startedAt <= PENDING_MAX_AGE_MS),
  )

/** Saves `ctx` under `uuid` (the old entries pruned first); false when the storage refused. */
export function savePending(uuid: string, ctx: PendingPayment): boolean {
  return writeJson('local', PENDING_KEY, { ...fresh(readAll(), Date.now()), [uuid]: ctx })
}

export function getPending(uuid: string): PendingPayment | null {
  return readAll()[uuid] ?? null
}

/** Drops the entries older than 7 days at `now`. */
export function prunePending(now: number = Date.now()): void {
  const entries = readAll()
  const kept = fresh(entries, now)
  if (Object.keys(kept).length !== Object.keys(entries).length)
    writeJson('local', PENDING_KEY, kept)
}

/** Forgets one payment (it settled, or the uuid is stale). */
export function removePending(uuid: string): void {
  const entries = readAll()
  if (!(uuid in entries)) return
  delete entries[uuid]
  writeJson('local', PENDING_KEY, entries)
}
