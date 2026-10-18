import type { GatewayOption, WalletBalance } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format/number'
import { gatewayFloor } from '@/features/payment/routes'

// What a top-up may charge (order digest §3.3.1, §5.12, §7): from `GET wallet/` alone, the
// shop's per-charge floor and ceiling, the rest of the rolling day's limit, and the chosen bank
// gateway's own range (its floor at least the adapters' 1,000 Toman, `gatewayFloor`). These are
// the min and max of API fields: nothing is summed. The presets are the round amounts inside
// them. Every sentence says its bound in Persian digits. Pure.

export type TopUpWallet = Pick<
  WalletBalance,
  'minimum_top_up_amount' | 'maximum_top_up_amount' | 'remaining_daily_top_up'
>

/** Which limit sets the ceiling (its sentence differs). */
export type TopUpCeiling = 'maximum' | 'daily' | 'gateway'

export interface TopUpBounds {
  min: number
  max: number
  ceiling: TopUpCeiling
  /** false: nothing can be charged now (the day's rest is under the floor). */
  open: boolean
}

/** The round amounts offered as chips, when inside the bounds. */
export const TOP_UP_PRESETS: readonly number[] = [100_000, 500_000, 1_000_000, 5_000_000]

export function topUpBounds(wallet: TopUpWallet, gateway: GatewayOption | null): TopUpBounds {
  const min = Math.max(wallet.minimum_top_up_amount, gateway ? gatewayFloor(gateway) : 0)
  const ceilings: [TopUpCeiling, number][] = [
    ['maximum', wallet.maximum_top_up_amount],
    ['daily', wallet.remaining_daily_top_up],
  ]
  if (gateway?.maximum_amount != null) ceilings.push(['gateway', gateway.maximum_amount])
  const [ceiling, max] = ceilings.reduce((low, next) => (next[1] < low[1] ? next : low))
  return { min, max, ceiling, open: max >= min }
}

export const presetsWithin = (bounds: TopUpBounds): number[] =>
  TOP_UP_PRESETS.filter((amount) => amount >= bounds.min && amount <= bounds.max)

/** «حداقل … و حداکثر … تومان» (and when the day's rest is what limits it). */
export function boundsHint(bounds: TopUpBounds): string {
  const range = `حداقل ${formatToman(bounds.min)} و حداکثر ${formatToman(bounds.max)}`
  return bounds.ceiling === 'daily' ? `${range} (باقی\u{200C}ماندهٔ سقف شارژ امروز)` : range
}

/** The day's limit is spent (or what is left is under the floor). */
export function closedForToday(wallet: Pick<WalletBalance, 'remaining_daily_top_up'>): string {
  return wallet.remaining_daily_top_up > 0
    ? `از سقف شارژ امروز فقط ${formatToman(wallet.remaining_daily_top_up)} باقی مانده که کمتر از حداقل مبلغ شارژ است؛ فردا دوباره تلاش کنید.`
    : 'سقف شارژ امروز کیف پول پر شده است؛ فردا دوباره تلاش کنید.'
}

/** Why `amount` cannot be charged, or null when it can. */
export function topUpProblem(amount: number | null, bounds: TopUpBounds): string | null {
  if (amount === null || amount <= 0) return 'مبلغ شارژ را وارد کنید.'
  if (amount < bounds.min) return `حداقل مبلغ شارژ ${formatToman(bounds.min)} است.`
  if (amount <= bounds.max) return null
  if (bounds.ceiling === 'daily')
    return `از سقف شارژ امروز ${formatToman(bounds.max)} باقی مانده است؛ مبلغ کمتری وارد کنید.`
  if (bounds.ceiling === 'gateway')
    return `حداکثر مبلغ پرداخت با این درگاه ${formatToman(bounds.max)} است.`
  return `حداکثر مبلغ شارژ ${formatToman(bounds.max)} است.`
}

/**
 * The `gateway_code` a top-up sends (digest §3.2.2, §5.4): the chosen gateway whenever the
 * chooser shows (the default included), else none for the shop's default (the server picks it)
 * and the code of a lone other gateway.
 */
export function topUpGatewayCode(
  gateways: GatewayOption[],
  chosen: GatewayOption | null,
): string | undefined {
  if (!chosen) return undefined
  if (gateways.length > 1) return chosen.code
  return chosen.is_default ? undefined : chosen.code
}
