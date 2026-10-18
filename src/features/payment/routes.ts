import type { FeatureKey } from '@/lib/api/types/common'
import type { GatewayOption, PaymentMethodOption, PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'

// Which payment routes to offer (order digest §5.3), from the operator's method list, the
// gateways, the shopper's wallet and the amounts: the cart's before placement (A, its
// `amount_charged_online`, and D), the order's after it (O, what is still owed online). Every
// route the operator lists comes back enabled, or disabled with a Persian reason under it;
// hidden are only pay-on-delivery while anything is owed online, the wallet routes for a guest
// (who is offered a login instead) and the routes the shop proved it cannot run now (`withdrawn`:
// the bank routes after `gateway_not_configured`). The server stays the judge: an intent can still be refused.
// The one sum here is the digest's own wallet split (§5.6: the wallet's part, the bank's rest).
// Pure: safe in any bundle.

export interface FeatureFlag {
  enabled: boolean
  reason: string | null
}

/** What the rules read of a route (the server's view of it carries its sanitised texts too). */
export type RouteMethod = Pick<
  PaymentMethodOption,
  | 'route'
  | 'label'
  | 'icon'
  | 'max_amount'
  | 'requires_authentication'
  | 'display_order'
  | 'is_available'
  | 'reason'
>

export interface RouteInput<M extends RouteMethod = PaymentMethodOption> {
  methods: M[]
  isGuest: boolean
  /** The signed-in shopper's wallet (`GET wallet/`); null: a guest, or not read (yet). */
  wallet: { balance: number; is_frozen: boolean; freeze_message?: string | null } | null
  /** What is owed online now: the cart's A before placement, the order's O after. */
  online: number
  /** D: collected at the door. */
  onDelivery: number
  gateways: GatewayOption[]
  features: Record<'online_payment' | 'wallet' | 'pay_on_delivery', FeatureFlag>
  /** The full online amount (A) a route's `max_amount` is compared with; default `online`. */
  charged?: number
  /**
   * Routes the shop proved it cannot run now, hidden: the bank routes after
   * `gateway_not_configured`/`gateway_result_url_invalid`, card transfer after
   * `payment_no_active_bank_card`.
   */
  withdrawn?: readonly PaymentRoute[]
  /** The wallet's balance is being read: its routes wait (not a refusal). */
  walletPending?: boolean
}

export interface RouteChoice<M extends RouteMethod = PaymentMethodOption> {
  route: PaymentRoute
  enabled: boolean
  /** Why it cannot be used now (Persian), when disabled. */
  reason?: string
  /** Its label, texts and icon; null for a confirmation the operator does not list. */
  method: M | null
  /** Bank routes: the gateways that take the bank's amount (a chooser when more than one). */
  gateways: GatewayOption[]
  /** wallet_and_gateway: the wallet's part (set aside until the bank settles) and the bank's. */
  split?: { wallet: number; gateway: number }
}

/** The gateway adapters' own floor (digest §3.2.2): no gateway takes less. */
const ADAPTER_FLOOR = 1_000

const FEATURES: Record<PaymentRoute, FeatureKey[]> = {
  bank_gateway: ['online_payment'],
  wallet: ['wallet'],
  wallet_and_gateway: ['wallet', 'online_payment'],
  card_transfer: [],
  pay_on_delivery: ['pay_on_delivery'],
}

/** The routes with a bank leg. */
export const BANK_ROUTES: readonly PaymentRoute[] = ['bank_gateway', 'wallet_and_gateway']
const WALLET_ROUTES: readonly PaymentRoute[] = ['wallet', 'wallet_and_gateway']

const OFF = 'این روش پرداخت موقتاً در دسترس نیست.'
const NO_WALLET = 'موجودی کیف پول شما خوانده نشد.'
const WALLET_PENDING = 'در حال خواندن موجودی کیف پول…'
const FROZEN = 'کیف پول شما مسدود است.'
const NO_GATEWAY = 'درگاه بانکی در دسترس نیست.'
const CONFIRM_OFF = 'تأیید سفارش اکنون ممکن نیست.'

/** The lowest amount a gateway takes. */
export const gatewayFloor = (gateway: GatewayOption) =>
  Math.max(gateway.minimum_amount, ADAPTER_FLOOR)

const takes = (gateway: GatewayOption, amount: number) =>
  amount >= gatewayFloor(gateway) &&
  (gateway.maximum_amount === null || amount <= gateway.maximum_amount)

/** Why no gateway takes `amount` (none listed, under every floor, over every ceiling). */
function noGatewayReason(gateways: GatewayOption[], amount: number, part: boolean): string {
  if (gateways.length === 0) return NO_GATEWAY
  const floor = Math.min(...gateways.map(gatewayFloor))
  const what = part ? 'مبلغ باقی\u{200C}مانده برای درگاه' : 'مبلغ'
  if (amount < floor)
    return `${what} کمتر از حداقل پرداخت با درگاه بانکی (${formatToman(floor)}) است.`
  return `${what} بیشتر از سقف پرداخت با درگاه\u{200C}های بانکی است.`
}

/** A closed switch, a closed route or a ceiling: what every route is checked for first. */
function commonReason(method: RouteMethod, input: RouteInput<RouteMethod>, amount: number) {
  for (const key of FEATURES[method.route]) {
    const flag = input.features[key as keyof RouteInput['features']]
    if (!flag.enabled) return flag.reason ?? method.reason ?? OFF
  }
  if (!method.is_available) return method.reason ?? OFF
  if (method.max_amount !== null && amount > method.max_amount) {
    return `مبلغ این سفارش از سقف این روش (${formatToman(method.max_amount)}) بیشتر است.`
  }
  return null
}

function walletReason(input: RouteInput<RouteMethod>): string | null {
  const { wallet } = input
  if (!wallet) return input.walletPending ? WALLET_PENDING : NO_WALLET
  if (wallet.is_frozen) return wallet.freeze_message?.trim() || FROZEN
  return null
}

function choose<M extends RouteMethod>(method: M, input: RouteInput<M>): RouteChoice<M> {
  const { online, gateways } = input
  const choice = (reason: string | null, extra: Partial<RouteChoice<M>> = {}): RouteChoice<M> => ({
    route: method.route,
    enabled: reason === null,
    ...(reason === null ? {} : { reason }),
    method,
    gateways: [],
    ...extra,
  })
  const common = commonReason(method, input, input.charged ?? online)
  if (common) return choice(common)
  switch (method.route) {
    case 'bank_gateway': {
      const offered = gateways.filter((gateway) => takes(gateway, online))
      return choice(offered.length ? null : noGatewayReason(gateways, online, false), {
        gateways: offered,
      })
    }
    case 'wallet': {
      const balance = input.wallet?.balance ?? 0
      const short = `موجودی کیف پول شما (${formatToman(balance)}) برای این مبلغ کافی نیست.`
      return choice(walletReason(input) ?? (balance >= online ? null : short))
    }
    case 'wallet_and_gateway': {
      const blocked = walletReason(input)
      if (blocked) return choice(blocked)
      const balance = input.wallet!.balance
      if (balance <= 0) return choice('موجودی کیف پول شما صفر است.')
      if (balance >= online) {
        return choice('موجودی کیف پول برای کل مبلغ کافی است؛ «کیف پول» را انتخاب کنید.')
      }
      const split = { wallet: balance, gateway: online - balance }
      const offered = gateways.filter((gateway) => takes(gateway, split.gateway))
      return choice(offered.length ? null : noGatewayReason(gateways, split.gateway, true), {
        gateways: offered,
        split,
      })
    }
    default:
      return choice(null)
  }
}

/** The routes to show, in the operator's order (`display_order`). */
export function availableRoutes<M extends RouteMethod>(input: RouteInput<M>): RouteChoice<M>[] {
  const sorted = [...input.methods].sort((a, b) => a.display_order - b.display_order)
  if (input.online === 0) {
    // Nothing owed online (D at the door, or a free order): only the confirmation (no chooser),
    // its ceiling against D. It is the order's only way on (digest §5.2 step 5), listed by the
    // operator or not; only its switch can close it.
    const cod = sorted.find((item) => item.route === 'pay_on_delivery')
    if (cod) return [choose(cod, { ...input, charged: input.onDelivery })]
    const { enabled, reason } = input.features.pay_on_delivery
    const off = enabled ? {} : { reason: reason ?? CONFIRM_OFF }
    return [{ route: 'pay_on_delivery', enabled, ...off, method: null, gateways: [] }]
  }
  return sorted
    .filter(
      ({ route, requires_authentication }) =>
        route !== 'pay_on_delivery' &&
        !(input.isGuest && (requires_authentication || WALLET_ROUTES.includes(route))) &&
        !input.withdrawn?.includes(route),
    )
    .map((method) => choose(method, input))
}

/** A guest is offered «ورود برای استفاده از کیف پول» where a wallet route would be open. */
export function walletLoginOffered<M extends RouteMethod>(input: RouteInput<M>): boolean {
  return (
    input.isGuest &&
    input.online > 0 &&
    input.features.wallet.enabled &&
    input.methods.some((item) => item.requires_authentication && item.is_available)
  )
}

/**
 * The route chosen for the shopper while they have chosen none: the first enabled one in the
 * operator's order, never a wallet route (spending stored money is the shopper's own choice).
 */
export function defaultRoute<M extends RouteMethod>(
  routes: RouteChoice<M>[],
): RouteChoice<M> | null {
  return routes.find((choice) => choice.enabled && !WALLET_ROUTES.includes(choice.route)) ?? null
}

/** The gateway preselected in the chooser: the shop's default when it takes the amount. */
export function defaultGateway(gateways: GatewayOption[]): GatewayOption | null {
  return gateways.find((gateway) => gateway.is_default) ?? gateways[0] ?? null
}

/**
 * The `gateway_code` to send (digest §3.2.2, §5.4): the gateway shown chosen whenever the chooser
 * shows (the shopper saw and kept it, the default included), else none for the shop's default
 * (the server picks its default itself, then the first usable one) and the code of a lone other
 * gateway. Never for a route without a bank part. The dev backend answers any named gateway
 * with 400 `gateway_unknown` (its credentials cannot be read, digest §11 #3); unnamed, 503
 * `gateway_not_configured`.
 */
export function gatewayCodeFor<M extends RouteMethod>(
  choice: RouteChoice<M>,
  chosen: string | null,
  all: GatewayOption[],
): string | undefined {
  if (!BANK_ROUTES.includes(choice.route) || choice.gateways.length === 0) return undefined
  if (choice.gateways.length > 1) {
    return (
      choice.gateways.find((gateway) => gateway.code === chosen) ?? defaultGateway(choice.gateways)!
    ).code
  }
  const only = choice.gateways[0]!
  return only.code === all.find((gateway) => gateway.is_default)?.code ? undefined : only.code
}

export const isBankRoute = (route: PaymentRoute) => BANK_ROUTES.includes(route)
export const isWalletRoute = (route: PaymentRoute) => WALLET_ROUTES.includes(route)
