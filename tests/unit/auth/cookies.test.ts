import { describe, expect, it } from 'vitest'
import { CART_MAX_AGE, COOKIE, cookieOptions, tokenMaxAge } from '@/lib/auth/cookies'
import { jwtExpiringIn, makeJwt } from '../support/jwt'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)

describe('COOKIE', () => {
  it('names the four session cookies', () => {
    expect(COOKIE).toEqual({ access: 'ff_at', refresh: 'ff_rt', cart: 'ff_cart', flag: 'ff_auth' })
  })
})

describe('cookieOptions', () => {
  it('makes token cookies httpOnly, Lax, site-wide, with the given max-age', () => {
    for (const name of ['access', 'refresh', 'cart'] as const) {
      expect(cookieOptions(name, 900, true)).toEqual({
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: '/',
        maxAge: 900,
      })
    }
  })

  it('leaves the ff_auth flag readable by scripts', () => {
    expect(cookieOptions('flag', 60, false)).toEqual({
      httpOnly: false,
      secure: false,
      sameSite: 'lax',
      path: '/',
      maxAge: 60,
    })
  })

  it('floors the max-age and never makes it negative', () => {
    expect(cookieOptions('access', 899.9, false).maxAge).toBe(899)
    expect(cookieOptions('access', -10, false).maxAge).toBe(0)
    expect(cookieOptions('access', Number.NaN, false).maxAge).toBe(0)
  })

  it('keeps the guest cart for 30 days', () => {
    expect(CART_MAX_AGE).toBe(30 * 24 * 60 * 60)
  })
})

describe('tokenMaxAge', () => {
  it('is exp minus now, in seconds', () => {
    expect(tokenMaxAge(jwtExpiringIn(900, NOW), NOW)).toBe(900)
    expect(tokenMaxAge(jwtExpiringIn(2_592_000, NOW), NOW)).toBe(2_592_000)
  })

  it('is 0 for an expired or undecodable token, so the cookie is not kept', () => {
    expect(tokenMaxAge(jwtExpiringIn(-1, NOW), NOW)).toBe(0)
    expect(tokenMaxAge(makeJwt({}), NOW)).toBe(0)
    expect(tokenMaxAge('nope', NOW)).toBe(0)
  })
})
