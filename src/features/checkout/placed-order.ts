import { saveGuestOrder } from '@/features/orders/guest-orders'
import { linkTokenOf } from '@/features/orders/pay-link'
import type { PaymentDoor } from '@/features/payment/api'
import type { OrderPlacementResult } from '@/lib/api/types/order'
import type { PaymentRoute } from '@/lib/api/types/payment'
import { isRecord, readJson, writeJson } from '@/lib/store/json-storage'
import { clearPlacementKey } from './idempotency'
import { PLACED_KEY } from './placed/last-placed'
import { clearReceiverDraft } from './receiver-draft'

// The order just placed, as the rest of the checkout and the thanks page need it (order digest
// §5.1 step 4, §5.2 step 3): kept in this tab's sessionStorage (`ff-checkout-placed`, the last
// order only), never in a URL but its code. What a payment came to is recorded only from what
// the server answered (`outcome`), so the thanks page never claims more than the server said.
// The order uuid and link token are credentials: kept here, never logged.

export { PLACED_KEY }

/**
 * - `awaiting_payment`: nothing paid yet (or not known here);
 * - `confirmed`: a pay-on-delivery order the server confirmed (`free`: nothing at the door either);
 * - `unconfirmed`: that confirmation failed (`failure`), the order waits for it;
 * - `paid`: the wallet paid it, the server said `settled`;
 * - `settled`: the server said nothing is owed online any more (`failure` is its sentence).
 */
export type PlacedOutcome = 'awaiting_payment' | 'confirmed' | 'unconfirmed' | 'paid' | 'settled'

export interface PlacedContext {
  orderCode: string
  orderUuid: string
  linkToken: string | null
  paymentUrl: string | null
  expiresAt: string | null
  total: number
  /** Owed online (A) and at the door (D) at placement. */
  A: number
  D: number
  placedAt: string
  guest: boolean
  /** The route placed with, and its gateway. */
  route: PaymentRoute
  gatewayCode: string | null
  outcome: PlacedOutcome
  free?: boolean
  failure?: string
}

/** The door a payment of this order goes through: the owner's, or the link (a guest's). */
export function doorOf(ctx: PlacedContext): PaymentDoor | null {
  if (!ctx.guest) return { kind: 'uuid', orderUuid: ctx.orderUuid }
  return ctx.linkToken ? { kind: 'link', token: ctx.linkToken } : null
}

export function contextOf(
  order: OrderPlacementResult,
  {
    guest,
    route,
    gatewayCode,
  }: { guest: boolean; route: PaymentRoute; gatewayCode: string | null },
): PlacedContext {
  return {
    orderCode: order.order_code,
    orderUuid: order.uuid,
    linkToken: linkTokenOf(order.payment_url),
    paymentUrl: order.payment_url,
    expiresAt: order.payment_expires_at,
    total: order.total,
    A: order.amount_charged_online,
    D: order.amount_to_collect_on_delivery,
    placedAt: order.placed_at,
    guest,
    route,
    gatewayCode,
    outcome: 'awaiting_payment',
  }
}

const isContext = (value: unknown): value is PlacedContext =>
  isRecord(value) &&
  typeof value.orderCode === 'string' &&
  typeof value.orderUuid === 'string' &&
  typeof value.guest === 'boolean' &&
  typeof value.outcome === 'string'

/** Stored with when it was written (`savedAt`: the checkout shows a recent one only). */
export function savePlaced(ctx: PlacedContext): void {
  writeJson('session', PLACED_KEY, { ...ctx, savedAt: Date.now() })
}

/** The order placed in this tab, if it is `code`'s. */
export function readPlaced(code: string): PlacedContext | null {
  const stored = readJson('session', PLACED_KEY)
  return isContext(stored) && stored.orderCode === code ? stored : null
}

/** Records what a payment came to (the server's answer) on the stored order. */
export function updatePlaced(code: string, changes: Partial<PlacedContext>): PlacedContext | null {
  const current = readPlaced(code)
  if (!current) return null
  const next = { ...current, ...changes }
  savePlaced(next)
  return next
}

/**
 * An order a replayed key met for another cart (`submitPlacement`'s `earlier`): kept where a
 * placed order is (the guest's recent orders, this tab's last order), and the key forgotten, so
 * the next press places the cart on screen; the purchase itself (its draft) goes on.
 */
export function recordEarlier(ctx: PlacedContext): void {
  saveGuest(ctx)
  savePlaced(ctx)
  clearPlacementKey()
}

function saveGuest(ctx: PlacedContext): void {
  if (!ctx.guest || !ctx.linkToken) return
  saveGuestOrder({
    orderCode: ctx.orderCode,
    linkToken: ctx.linkToken,
    expiresAt: ctx.expiresAt,
    A: ctx.A,
    D: ctx.D,
    total: ctx.total,
    placedAt: ctx.placedAt,
  })
}

/**
 * Everything a 2xx placement ends (order digest §5.1–5.2): a guest's order goes to the recent
 * guest orders (their only way back), the order to this tab's store for the thanks page, and the
 * purchase's placement key and the guest's receiver draft are forgotten. (The caller clears the
 * cart cache: the badge empties.)
 */
export function afterPlacement(ctx: PlacedContext): void {
  saveGuest(ctx)
  savePlaced(ctx)
  clearPlacementKey()
  clearReceiverDraft()
}
