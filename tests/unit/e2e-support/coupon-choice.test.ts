import { describe, expect, it, vi } from 'vitest'
import { couponsToTry, firstTaken, SAMPLE_COUPONS } from '../../e2e/support/coupon-choice'

// Which sample coupon the guest's pay-on-delivery journey applies (Plan 4 Task 10 fix round): the
// sample codes run out (TEA30 on 2026-10-28, FREESHIP on 2026-11-12) on a read-only backend, so
// they are tried in turn; the first the API takes is the one, and with none taken the journey
// goes on without a coupon (said). `E2E_COUPONS` replaces the list.

const taken = (code: string) => ({ code, taken: { code } })
const refused = (code: string, refusal: string) => ({ code, refusal })

describe('firstTaken', () => {
  it('the first code taken: no other tried', async () => {
    const apply = vi.fn(async (code: string) => taken(code))
    expect(await firstTaken(['TEA30', 'FREESHIP'], apply)).toEqual({
      applied: taken('TEA30'),
      refused: [],
    })
    expect(apply).toHaveBeenCalledTimes(1)
  })

  it('a refused code (expired, unknown): the next one, the refusal kept', async () => {
    const apply = vi.fn(async (code: string) =>
      code === 'TEA30' ? refused(code, 'coupon_expired') : taken(code),
    )
    expect(await firstTaken(['TEA30', 'FREESHIP'], apply)).toEqual({
      applied: taken('FREESHIP'),
      refused: [refused('TEA30', 'coupon_expired')],
    })
  })

  it('none taken: no coupon, every refusal said', async () => {
    const apply = vi.fn(async (code: string) => refused(code, 'coupon_expired'))
    expect(await firstTaken(['TEA30', 'FREESHIP'], apply)).toEqual({
      applied: null,
      refused: [refused('TEA30', 'coupon_expired'), refused('FREESHIP', 'coupon_expired')],
    })
  })
})

describe('couponsToTry', () => {
  it('the sample codes, TEA30 first', () => {
    expect(couponsToTry(undefined)).toEqual(['TEA30', 'FREESHIP'])
    expect(SAMPLE_COUPONS).toEqual(['TEA30', 'FREESHIP'])
  })

  it('E2E_COUPONS replaces them (comma-separated, blanks dropped); empty: the samples', () => {
    expect(couponsToTry('NOWRUZ25, FREESHIP')).toEqual(['NOWRUZ25', 'FREESHIP'])
    expect(couponsToTry(' , ')).toEqual(['TEA30', 'FREESHIP'])
  })
})
