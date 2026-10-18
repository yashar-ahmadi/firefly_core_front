import { describe, expect, it } from 'vitest'
import { costLabel, defaultOption, etaLabel } from '@/features/checkout/shipping-labels'
import { option, tehranOptions } from './fixtures'

// What a shipping option says (cart digest §3.9, §6.7), pure: its delivery time in business
// days, its cost from `total` (free only when it is), and which one the checkout picks itself
// (controller ruling, Task 2 fix round 1: the operator's default, never a door-paid fare).

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

describe('defaultOption', () => {
  it('the first option in the API’s order that is available and its sender pays', () => {
    // Tehran: peyk-tehran is listed first (the operator's `display_order`).
    expect(defaultOption(tehranOptions().options)?.code).toBe('peyk-tehran')
  })

  it('skips a cheaper door-paid (پس‌کرایه) option and an unavailable one', () => {
    const options = [option('bar-sangin'), option('tipax'), option('post-sefareshi')]
    expect(defaultOption(options)?.code).toBe('post-sefareshi')
  })

  it('none when only door-paid or unavailable options are left: the shopper chooses', () => {
    expect(defaultOption([option('tipax'), option('bar-sangin')])).toBeNull()
    expect(defaultOption([])).toBeNull()
  })

  it('a refused default gives way to the next one its sender pays', () => {
    const options = tehranOptions().options
    expect(defaultOption(options, new Set(['peyk-tehran']))?.code).toBe('post-pishtaz')
  })

  it('the operator’s order decides, a free option its sender pays included (no guessing)', () => {
    const options = [option('hozouri'), option('peyk-tehran')]
    expect(defaultOption(options)?.code).toBe('hozouri')
  })
})
