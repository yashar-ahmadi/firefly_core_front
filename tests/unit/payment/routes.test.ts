import { describe, expect, it } from 'vitest'
import {
  availableRoutes,
  defaultRoute,
  gatewayCodeFor,
  walletLoginOffered,
  type RouteInput,
} from '@/features/payment/routes'
import { FEATURES_ON, gateways, method, methods, wallet } from './fixtures'

// Which payment routes the checkout offers (order digest §5.3), for the cart's amounts before
// placement and the order's after: every route the operator lists comes back enabled or
// disabled with a Persian reason, except the ones the table hides (COD while something is owed
// online, wallet routes for a guest, bank routes the shop cannot run).

const input = (changes: Partial<RouteInput> = {}): RouteInput => ({
  methods: methods(),
  isGuest: false,
  wallet: wallet(),
  online: 1_049_000,
  onDelivery: 0,
  gateways: gateways(),
  features: FEATURES_ON,
  ...changes,
})

const routeOf = (changes: Partial<RouteInput>, route: string) =>
  availableRoutes(input(changes)).find((choice) => choice.route === route)
const names = (changes: Partial<RouteInput> = {}) =>
  availableRoutes(input(changes)).map((choice) => choice.route)

describe('availableRoutes', () => {
  it('hides pay_on_delivery while something is owed online, in the operator’s order', () => {
    expect(names()).toEqual(['bank_gateway', 'wallet', 'wallet_and_gateway', 'card_transfer'])
    expect(names({ online: 70_000, onDelivery: 289_000 })).not.toContain('pay_on_delivery')
  })

  it('offers only pay_on_delivery («تأیید سفارش») when nothing is owed online', () => {
    const routes = availableRoutes(input({ online: 0, onDelivery: 289_000 }))
    expect(routes.map(({ route, enabled }) => [route, enabled])).toEqual([
      ['pay_on_delivery', true],
    ])
    // A free order too.
    expect(availableRoutes(input({ online: 0, onDelivery: 0 }))[0]).toMatchObject({
      route: 'pay_on_delivery',
      enabled: true,
    })
  })

  it('the confirmation past its ceiling or switched off: disabled with a reason', () => {
    const over = routeOf({ online: 0, onDelivery: 25_000_000 }, 'pay_on_delivery')!
    expect(over.enabled).toBe(false)
    expect(over.reason).toBe('مبلغ این سفارش از سقف این روش (۲۰٬۰۰۰٬۰۰۰ تومان) بیشتر است.')
    const off = routeOf(
      {
        online: 0,
        onDelivery: 100,
        features: { ...FEATURES_ON, pay_on_delivery: { enabled: false, reason: 'تعطیل است.' } },
      },
      'pay_on_delivery',
    )!
    expect(off).toMatchObject({ enabled: false, reason: 'تعطیل است.' })
  })

  it('nothing owed online and no pay-on-delivery listed: the confirmation all the same', () => {
    // A free order (or one paid at the door) has no other way on; the operator's list is not
    // asked (digest §5.2 step 5), only the switch.
    const unlisted = { online: 0, onDelivery: 0, methods: methods().slice(0, 4) }
    expect(availableRoutes(input(unlisted))).toEqual([
      { route: 'pay_on_delivery', enabled: true, method: null, gateways: [] },
    ])
    const off = { ...FEATURES_ON, pay_on_delivery: { enabled: false, reason: null } }
    expect(availableRoutes(input({ ...unlisted, features: off }))[0]).toMatchObject({
      enabled: false,
      reason: 'تأیید سفارش اکنون ممکن نیست.',
    })
  })

  it('hides the wallet routes for a guest (and offers a login instead)', () => {
    expect(names({ isGuest: true, wallet: null })).toEqual(['bank_gateway', 'card_transfer'])
    expect(walletLoginOffered(input({ isGuest: true, wallet: null }))).toBe(true)
    expect(walletLoginOffered(input())).toBe(false)
    const off = { ...FEATURES_ON, wallet: { enabled: false, reason: null } }
    expect(walletLoginOffered(input({ isGuest: true, wallet: null, features: off }))).toBe(false)
  })

  it('disables the wallet when it is frozen, with the freeze message as the reason', () => {
    const frozen = wallet({ is_frozen: true, freeze_message: 'کیف پول شما مسدود شده است.' })
    expect(routeOf({ wallet: frozen }, 'wallet')).toMatchObject({
      enabled: false,
      reason: 'کیف پول شما مسدود شده است.',
    })
    expect(routeOf({ wallet: frozen }, 'wallet_and_gateway')).toMatchObject({ enabled: false })
    // No message: a sentence of its own.
    expect(routeOf({ wallet: wallet({ is_frozen: true }) }, 'wallet')!.reason).toBe(
      'کیف پول شما مسدود است.',
    )
  })

  it('the wallet alone only for a balance that covers the amount', () => {
    expect(routeOf({ wallet: wallet({ balance: 1_049_000 }) }, 'wallet')!.enabled).toBe(true)
    const short = routeOf({ wallet: wallet({ balance: 300_000 }) }, 'wallet')!
    expect(short.enabled).toBe(false)
    expect(short.reason).toBe('موجودی کیف پول شما (۳۰۰٬۰۰۰ تومان) برای این مبلغ کافی نیست.')
    expect(routeOf({ wallet: null }, 'wallet')).toMatchObject({ enabled: false })
  })

  it('enables wallet_and_gateway only when 0 < balance < online, with the split', () => {
    const part = routeOf({ wallet: wallet({ balance: 300_000 }) }, 'wallet_and_gateway')!
    expect(part).toMatchObject({ enabled: true, split: { wallet: 300_000, gateway: 749_000 } })
    expect(routeOf({ wallet: wallet({ balance: 0 }) }, 'wallet_and_gateway')).toMatchObject({
      enabled: false,
      reason: 'موجودی کیف پول شما صفر است.',
    })
    const covers = routeOf({ wallet: wallet({ balance: 1_049_000 }) }, 'wallet_and_gateway')!
    expect(covers.enabled).toBe(false)
    expect(covers.reason).toMatch(/کیف پول/)
    // The bank's part under every gateway's floor (10,000): not offered.
    const tiny = routeOf({ wallet: wallet({ balance: 1_045_000 }) }, 'wallet_and_gateway')!
    expect(tiny.enabled).toBe(false)
  })

  it('a bank only within a gateway’s range; the gateways that take the amount', () => {
    const bank = routeOf({}, 'bank_gateway')!
    expect(bank.enabled).toBe(true)
    expect(bank.gateways.map((gateway) => gateway.code)).toEqual(['ZARINPAL', 'ZIBAL'])
    // Over ZIBAL's ceiling: only ZARINPAL.
    expect(
      routeOf({ online: 600_000_000 }, 'bank_gateway')!.gateways.map(({ code }) => code),
    ).toEqual(['ZARINPAL'])
    const small = routeOf({ online: 5_000 }, 'bank_gateway')!
    expect(small.enabled).toBe(false)
    expect(small.reason).toBe('مبلغ کمتر از حداقل پرداخت با درگاه بانکی (۱۰٬۰۰۰ تومان) است.')
    expect(routeOf({ gateways: [] }, 'bank_gateway')).toMatchObject({ enabled: false })
  })

  it('routes the shop proved it cannot run are withdrawn (the banks after «not configured»)', () => {
    expect(names({ withdrawn: ['bank_gateway', 'wallet_and_gateway'] })).toEqual([
      'wallet',
      'card_transfer',
    ])
    expect(names({ withdrawn: ['card_transfer'] })).not.toContain('card_transfer')
  })

  it('while the balance is read, the wallet routes wait with a note (not a refusal)', () => {
    expect(routeOf({ wallet: null, walletPending: true }, 'wallet')).toMatchObject({
      enabled: false,
      reason: 'در حال خواندن موجودی کیف پول…',
    })
  })

  it('card transfer is always offered within its ceiling, compared with A', () => {
    expect(routeOf({}, 'card_transfer')!.enabled).toBe(true)
    const over = routeOf({ online: 60_000_000 }, 'card_transfer')!
    expect(over.enabled).toBe(false)
    expect(over.reason).toBe('مبلغ این سفارش از سقف این روش (۵۰٬۰۰۰٬۰۰۰ تومان) بیشتر است.')
    // The ceiling is the full online amount (A), not what is left (O).
    expect(routeOf({ online: 1_000_000, charged: 60_000_000 }, 'card_transfer')!.enabled).toBe(
      false,
    )
  })

  it('a route the method list or a switch closed: disabled with that reason', () => {
    const closed = routeOf(
      { methods: [method('bank_gateway', { is_available: false, reason: 'بسته است.' })] },
      'bank_gateway',
    )
    expect(closed).toMatchObject({ enabled: false, reason: 'بسته است.' })
    const off = routeOf(
      {
        features: {
          ...FEATURES_ON,
          online_payment: { enabled: false, reason: 'پرداخت آنلاین موقتاً غیرفعال است.' },
        },
      },
      'wallet_and_gateway',
    )
    expect(off).toMatchObject({ enabled: false, reason: 'پرداخت آنلاین موقتاً غیرفعال است.' })
    expect(
      routeOf({ features: { ...FEATURES_ON, wallet: { enabled: false, reason: null } } }, 'wallet')!
        .reason,
    ).toBe('این روش پرداخت موقتاً در دسترس نیست.')
  })
})

describe('defaultRoute and gatewayCodeFor', () => {
  it('the first enabled route in the operator’s order, never a wallet route', () => {
    expect(defaultRoute(availableRoutes(input()))?.route).toBe('bank_gateway')
    const noBank = availableRoutes(input({ withdrawn: ['bank_gateway', 'wallet_and_gateway'] }))
    expect(defaultRoute(noBank)?.route).toBe('card_transfer')
    const onlyWallet = availableRoutes(input({ methods: [method('wallet')] }))
    expect(defaultRoute(onlyWallet)).toBeNull()
    expect(defaultRoute(availableRoutes(input({ online: 0 })))?.route).toBe('pay_on_delivery')
  })

  it('the gateway shown chosen whenever the chooser shows; no code for a lone default', () => {
    const bank = routeOf({}, 'bank_gateway')!
    expect(gatewayCodeFor(bank, 'ZIBAL', gateways())).toBe('ZIBAL')
    // The chooser showed: the shopper kept (or picked) the default, its code is sent.
    expect(gatewayCodeFor(bank, null, gateways())).toBe('ZARINPAL')
    expect(gatewayCodeFor(bank, 'ZARINPAL', gateways())).toBe('ZARINPAL')
    const [only] = gateways()
    expect(
      gatewayCodeFor(routeOf({ gateways: [only!] }, 'bank_gateway')!, null, [only!]),
    ).toBeUndefined()
    // Only the default takes this amount: still no code.
    const big = routeOf({ online: 600_000_000 }, 'bank_gateway')!
    expect(gatewayCodeFor(big, null, gateways())).toBeUndefined()
    // Only another one takes it: that one's code, chooser or not.
    const zibalOnly = gateways().map((gateway) =>
      gateway.code === 'ZARINPAL' ? { ...gateway, minimum_amount: 5_000_000 } : gateway,
    )
    const small = routeOf({ gateways: zibalOnly }, 'bank_gateway')!
    expect(small.gateways.map(({ code }) => code)).toEqual(['ZIBAL'])
    expect(gatewayCodeFor(small, null, zibalOnly)).toBe('ZIBAL')
    expect(gatewayCodeFor(routeOf({}, 'card_transfer')!, 'ZIBAL', gateways())).toBeUndefined()
  })
})
