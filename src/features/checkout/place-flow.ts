import type { RouteChoice } from '@/features/payment/routes'
import type { Cart } from '@/lib/api/types/cart'
import type { CheckoutStep } from './checkout-steps'
import type { GuestField } from './guest-receiver'
import { placeOrder, PlacementError, type PlaceOrderInput } from './place-order'
import { afterPlacement, contextOf, recordEarlier, type PlacedContext } from './placed-order'
import type { Placement, PlacementNotice } from './use-place-order'

// The press's own work (order digest §5.1–5.2, §8.1), loaded on the press (the checkout's first
// load never carries it): the placement, then on a 2xx everything that ends the purchase
// (`afterPlacement`), or for a refusal what the page does about it (`handleRefusal`, with the
// page's own state and helpers handed in: this chunk adds no module the page does not have).
// `submitPlacement` never rejects: a refusal comes back as its `PlacementError`.

/**
 * `earlier`: a replay (200) of an order whose total is not this cart's: the key's 2xx was lost
 * and a new purchase began in this tab. That order is recorded, never taken for this purchase.
 */
export type PlacementOutcome =
  | { ok: true; ctx: PlacedContext }
  | { ok: 'earlier'; ctx: PlacedContext }
  | { ok: false; error: PlacementError }

export async function submitPlacement(
  input: PlaceOrderInput,
  { route, gatewayCode }: { route: RouteChoice['route']; gatewayCode: string | null },
): Promise<PlacementOutcome> {
  try {
    const { order, replayed } = await placeOrder(input)
    const ctx = contextOf(order, { guest: input.isGuest, route, gatewayCode })
    if (replayed && order.total !== input.expectedTotal) {
      recordEarlier(ctx)
      return { ok: 'earlier', ctx }
    }
    afterPlacement(ctx)
    return { ok: true, ctx }
  } catch (error) {
    return {
      ok: false,
      error: error instanceof PlacementError ? error : new PlacementError('other', error),
    }
  }
}

const CART_LINK = { href: '/cart/', label: 'بازگشت به سبد خرید' }
const TOTAL_UNREAD =
  'مبلغ سفارش تغییر کرد، ولی سبد خرید دوباره خوانده نشد. سبد را دوباره بخوانید تا مبلغ جدید را ببینید.'
const UNREAD_AGAIN = 'سبد خرید دوباره خوانده نشد؛ کمی بعد دوباره تلاش کنید.'

/** What a refusal may change on the page (use-place-order's state, the checkout's steps). */
export interface RefusalDeps {
  /** The cart read again (null: it could not be). */
  reread: () => Promise<Cart | null>
  invalidateShipping: () => void
  edit: (step: CheckoutStep) => void
  reopenReceiver: (fields: Partial<Record<GuestField, string>>) => void
  markGuestClosed: (detail: string) => void
  expire: () => void
  signedIn: boolean
  /** Forgets the placement key (one the API refused as malformed). */
  clearKey: () => void
  throttledMessage: string
  setNotice: (notice: PlacementNotice | null) => void
  setNoteError: (message: string) => void
  setThrottle: (throttle: Placement['throttle']) => void
  setTotalChanged: (changed: Placement['totalChanged']) => void
}

/**
 * What a refused placement means (digest §8.1): the cart read again where it changed, the step
 * that can put it right reopened, the API's sentence said (with the lines, the adjustments or
 * the way out it calls for). The total changed opens the dialog instead (same key next time).
 */
export async function handleRefusal(error: PlacementError, sent: number, deps: RefusalDeps) {
  const say = (extra: Partial<PlacementNotice> = {}) =>
    deps.setNotice({ message: error.detail, problem: error.problem, ...extra })
  switch (error.problem) {
    case 'total_changed': {
      // The dialog asks about the cart as it is now, so only once it is read; a read that fails
      // says what happened and offers to read it again (never the old amounts in a dialog).
      const ask = async () => {
        if (!(await deps.reread())) return false
        deps.setNotice(null)
        deps.setTotalChanged({ previous: sent })
        return true
      }
      if (await ask()) return
      return deps.setNotice({
        message: TOTAL_UNREAD,
        problem: 'total_changed',
        retry: { label: 'خواندن دوباره\u{0654} سبد خرید', run: ask, failedAgain: UNREAD_AGAIN },
      })
    }
    case 'session':
      deps.expire()
      return
    case 'shipping':
      deps.invalidateShipping()
      await deps.reread()
      deps.edit('shipping')
      return say()
    case 'destination':
      await deps.reread()
      deps.edit('receiver')
      return say()
    case 'receiver':
      deps.reopenReceiver(error.fields)
      return say()
    case 'note':
      return deps.setNoteError(error.detail)
    case 'guest_closed':
      deps.markGuestClosed(error.detail)
      return say()
    case 'unpaid_limit':
      return say({
        link: deps.signedIn
          ? {
              href: '/account/orders/?group=awaiting_payment',
              label: 'سفارش‌های در انتظار پرداخت',
            }
          : { href: '/order/track/', label: 'پیگیری سفارش' },
      })
    case 'items_unavailable':
      await deps.reread()
      return say({ items: error.items, link: CART_LINK })
    case 'cart_changed':
      // A guest token sent with a session merged the carts (the BFF never sends one with a
      // session, so there is none to drop here): the merged cart is read, its shipping
      // chosen again (the steps follow the cart), its adjustments said.
      await deps.reread()
      return say({ adjustments: error.adjustments })
    case 'cart_refresh':
    case 'receiver_forbidden':
      await deps.reread()
      return say()
    case 'cart_gone':
    case 'cart_empty':
      // Read again: an empty cart shows the way back to the shop.
      await deps.reread()
      return say({ link: CART_LINK })
    case 'throttled':
      deps.setThrottle({ error: error.cause, at: Date.now() })
      return deps.setNotice({ message: deps.throttledMessage, problem: 'throttled' })
    case 'invalid_key':
      deps.clearKey()
      return say()
    default:
      return say()
  }
}
