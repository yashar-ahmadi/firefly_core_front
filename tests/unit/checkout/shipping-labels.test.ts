import { describe, expect, it } from 'vitest'
import { cheapestAvailable, costLabel, etaLabel } from '@/features/checkout/shipping-labels'
import { option, tehranOptions } from './fixtures'

// What a shipping option says (cart digest §3.9, §6.7), pure: its delivery time in business
// days, its cost from `total` (free only when it is), and which one the checkout picks itself.

describe('etaLabel', () => {
  it('a range of business days', () => {
    expect(etaLabel(2, 4)).toBe('تحویل ۲ تا ۴ روز کاری')
    expect(etaLabel(3, 7)).toBe('تحویل ۳ تا ۷ روز کاری')
  })

  it('one number when both ends are the same; 0 is the same day', () => {
    expect(etaLabel(3, 3)).toBe('تحویل ۳ روز کاری')
    expect(etaLabel(0, 0)).toBe('تحویل همان روز')
    expect(etaLabel(0, 1)).toBe('تحویل همان روز تا ۱ روز کاری')
  })

  it('nothing without days; one end alone is that number', () => {
    expect(etaLabel(null, null)).toBeNull()
    expect(etaLabel(null, 4)).toBe('تحویل ۴ روز کاری')
    expect(etaLabel(2, null)).toBe('تحویل ۲ روز کاری')
  })
})

describe('costLabel', () => {
  it('the option’s `total`, in toman', () => {
    expect(costLabel(option('peyk-tehran'))).toBe('۷۰٬۰۰۰ تومان')
  })

  it('«رایگان» only when available, at 0, and its sender pays', () => {
    expect(costLabel(option('hozouri'))).toBe('رایگان')
    expect(costLabel(option('bar-sangin'))).toBeNull()
    expect(costLabel(option('tipax', { total: 0, price: 0, packaging_cost: 0 }))).toBe(
      'پس\u{200C}کرایه',
    )
    expect(costLabel(option('tipax'))).toBe('۱۵٬۰۰۰ تومان')
  })
})

describe('cheapestAvailable', () => {
  it('the available option with the lowest total, the API’s order breaking ties', () => {
    expect(cheapestAvailable(tehranOptions().options)?.code).toBe('hozouri')
    const tied = [option('tipax'), option('peyk-tehran', { total: 15_000 })]
    expect(cheapestAvailable(tied)?.code).toBe('tipax')
  })

  it('skips the ones already tried, and finds none among unavailable ones', () => {
    expect(cheapestAvailable(tehranOptions().options, new Set(['hozouri']))?.code).toBe('tipax')
    expect(cheapestAvailable([option('bar-sangin')])).toBeNull()
  })
})
