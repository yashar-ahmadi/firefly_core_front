import { describe, expect, it } from 'vitest'
import {
  amountDigits,
  amountText,
  groupDigits,
  parseAmount,
  regroup,
} from '@/features/wallet/amount-input'
import {
  boundsHint,
  closedForToday,
  presetsWithin,
  topUpBounds,
  topUpProblem,
} from '@/features/wallet/top-up-bounds'
import type { GatewayOption } from '@/lib/api/types/payment'
import { balance, gateways } from './fixtures'

// A top-up's bounds (order digest §3.3.1, §5.12): [minimum_top_up_amount, min(maximum_top_up_
// amount, remaining_daily_top_up)] from `GET wallet/`, and at least the chosen gateway's floor
// (max(minimum_amount, 1,000)); its ceiling too when it has one. The presets are the round
// amounts inside them; every bound is said in Persian digits. The amount is typed in any digits.

const ZARINPAL = gateways()[0]!
const gateway = (changes: Partial<GatewayOption>): GatewayOption => ({ ...ZARINPAL, ...changes })

describe('topUpBounds', () => {
  it('the shop’s floor and ceiling (dev: 50,000 to 50,000,000), the gateway’s floor under them', () => {
    expect(topUpBounds(balance(), ZARINPAL)).toEqual({
      min: 50_000,
      max: 50_000_000,
      ceiling: 'maximum',
      open: true,
    })
  })

  it('the rest of the day’s limit when it is lower', () => {
    const bounds = topUpBounds(balance({ remaining_daily_top_up: 700_000 }), ZARINPAL)
    expect(bounds).toMatchObject({ max: 700_000, ceiling: 'daily', open: true })
    expect(boundsHint(bounds)).toBe(
      'حداقل ۵۰٬۰۰۰ تومان و حداکثر ۷۰۰٬۰۰۰ تومان (باقی\u{200C}ماندهٔ سقف شارژ امروز)',
    )
  })

  it('the gateway’s floor when it is higher (never under the adapters’ 1,000), its ceiling', () => {
    expect(topUpBounds(balance(), gateway({ minimum_amount: 200_000 })).min).toBe(200_000)
    const low = balance({ minimum_top_up_amount: 10 })
    expect(topUpBounds(low, gateway({ minimum_amount: 0 })).min).toBe(1_000)
    expect(topUpBounds(low, null).min).toBe(10)
    expect(topUpBounds(balance(), gateway({ maximum_amount: 2_000_000 }))).toMatchObject({
      max: 2_000_000,
      ceiling: 'gateway',
    })
  })

  it('closed when the day’s rest is under the floor', () => {
    const wallet = balance({ remaining_daily_top_up: 20_000 })
    expect(topUpBounds(wallet, ZARINPAL).open).toBe(false)
    expect(closedForToday(wallet)).toContain('۲۰٬۰۰۰ تومان')
    expect(closedForToday(balance({ remaining_daily_top_up: 0 }))).toBe(
      'سقف شارژ امروز کیف پول پر شده است؛ فردا دوباره تلاش کنید.',
    )
  })
})

describe('presetsWithin', () => {
  it('only the round amounts inside the bounds', () => {
    expect(presetsWithin(topUpBounds(balance(), ZARINPAL))).toEqual([
      100_000, 500_000, 1_000_000, 5_000_000,
    ])
    const day = topUpBounds(balance({ remaining_daily_top_up: 700_000 }), ZARINPAL)
    expect(presetsWithin(day)).toEqual([100_000, 500_000])
    const floor = topUpBounds(balance({ minimum_top_up_amount: 600_000 }), ZARINPAL)
    expect(presetsWithin(floor)).toEqual([1_000_000, 5_000_000])
  })
})

describe('topUpProblem', () => {
  const bounds = topUpBounds(balance(), ZARINPAL)

  it('below `minimum_top_up_amount`: refused, the bound in Persian digits', () => {
    expect(topUpProblem(49_999, bounds)).toBe('حداقل مبلغ شارژ ۵۰٬۰۰۰ تومان است.')
  })

  it('above each ceiling, said by what sets it; nothing typed asks for an amount', () => {
    expect(topUpProblem(50_000_001, bounds)).toBe('حداکثر مبلغ شارژ ۵۰٬۰۰۰٬۰۰۰ تومان است.')
    const day = topUpBounds(balance({ remaining_daily_top_up: 700_000 }), ZARINPAL)
    expect(topUpProblem(800_000, day)).toBe(
      'از سقف شارژ امروز ۷۰۰٬۰۰۰ تومان باقی مانده است؛ مبلغ کمتری وارد کنید.',
    )
    const capped = topUpBounds(balance(), gateway({ maximum_amount: 2_000_000 }))
    expect(topUpProblem(3_000_000, capped)).toBe(
      'حداکثر مبلغ پرداخت با این درگاه ۲٬۰۰۰٬۰۰۰ تومان است.',
    )
    expect(topUpProblem(null, bounds)).toBe('مبلغ شارژ را وارد کنید.')
  })

  it('inside the bounds (both ends included): none', () => {
    expect(topUpProblem(50_000, bounds)).toBeNull()
    expect(topUpProblem(50_000_000, bounds)).toBeNull()
  })
})

describe('the amount as typed', () => {
  it('reads Persian, Arabic and Latin digits; separators and spaces ignored', () => {
    expect(parseAmount('۱۲۰٬۰۰۰')).toBe(120_000)
    expect(parseAmount('١٢٠,٠٠٠')).toBe(120_000)
    expect(parseAmount(' 120 000 تومان')).toBe(120_000)
    expect(parseAmount('')).toBeNull()
    expect(parseAmount('تومان')).toBeNull()
    expect(amountDigits('000۵۰')).toBe('50')
  })

  it('is shown grouped in Persian digits', () => {
    expect(groupDigits('1500000')).toBe('۱٬۵۰۰٬۰۰۰')
    expect(amountText(100_000)).toBe('۱۰۰٬۰۰۰')
    expect(amountText(null)).toBe('')
  })

  it('keeps the caret after the same digit while it regroups', () => {
    // «۱۰۰۰|» typed at the end: «۱٬۰۰۰|».
    expect(regroup('۱۰۰۰', 4)).toEqual({ text: '۱٬۰۰۰', caret: 5 })
    // A digit typed after the first one of «۱٬۰۰۰»: «۱۵|٬۰۰۰» → «۱۵|٬۰۰۰».
    expect(regroup('۱۵٬۰۰۰', 2)).toEqual({ text: '۱۵٬۰۰۰', caret: 2 })
    // A paste of Latin digits.
    expect(regroup('2500000', 7)).toEqual({ text: '۲٬۵۰۰٬۰۰۰', caret: 9 })
  })
})
