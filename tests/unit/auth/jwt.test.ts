import { describe, expect, it, vi } from 'vitest'
import { decodeJwtExp, isExpiring } from '@/lib/auth/jwt'
import { base64url, jwtExpiringIn, makeJwt } from '../support/jwt'

const NOW = Date.UTC(2026, 9, 15, 12, 0, 0)
const NOW_S = NOW / 1000

describe('decodeJwtExp', () => {
  it('reads exp in seconds without checking the signature', () => {
    expect(decodeJwtExp(makeJwt({ exp: NOW_S + 900, user_id: 7 }))).toBe(NOW_S + 900)
  })

  it('decodes base64url payloads that use - and _ and have no padding', () => {
    // '?>' encodes to 'Pz4' in base64url ('Pz4=' in base64), and '~~~' to 'fn5-'.
    const payload = base64url(JSON.stringify({ exp: 123, note: '?>~~~' }))
    expect(payload).toMatch(/[-_]/)
    expect(payload).not.toMatch(/=/)
    expect(decodeJwtExp(`eyJhbGciOiJIUzI1NiJ9.${payload}.sig`)).toBe(123)
  })

  it('returns null for anything that is not a three-part token with a numeric exp', () => {
    const notJson = `aGVhZA.${base64url('not json')}.sig`
    for (const token of [
      '',
      'abc',
      'a.b',
      'a.b.c.d',
      'a.!!!.c',
      notJson,
      makeJwt({}),
      makeJwt({ exp: '1700000000' }),
      makeJwt({ exp: Number.NaN }),
      `a.${base64url('[1,2]')}.c`,
      `a.${base64url('null')}.c`,
    ]) {
      expect(decodeJwtExp(token), token).toBeNull()
    }
  })
})

describe('isExpiring', () => {
  it('is true for a token that expires in 10 s (inside the 30 s skew)', () => {
    expect(isExpiring(jwtExpiringIn(10, NOW), 30, NOW)).toBe(true)
  })

  it('is false for a token that expires in 600 s', () => {
    expect(isExpiring(jwtExpiringIn(600, NOW), 30, NOW)).toBe(false)
  })

  it('is true for an expired token', () => {
    expect(isExpiring(jwtExpiringIn(-5, NOW), 30, NOW)).toBe(true)
  })

  it('treats a missing or undecodable token as expiring', () => {
    expect(isExpiring(null, 30, NOW)).toBe(true)
    expect(isExpiring(undefined, 30, NOW)).toBe(true)
    expect(isExpiring('', 30, NOW)).toBe(true)
    expect(isExpiring('garbage', 30, NOW)).toBe(true)
  })

  it('honours a custom skew and defaults to 30 s', () => {
    expect(isExpiring(jwtExpiringIn(100, NOW), 120, NOW)).toBe(true)
    expect(isExpiring(jwtExpiringIn(100, NOW), 60, NOW)).toBe(false)
    expect(isExpiring(jwtExpiringIn(31, NOW), undefined, NOW)).toBe(false)
    expect(isExpiring(jwtExpiringIn(29, NOW), undefined, NOW)).toBe(true)
  })

  it('defaults now to Date.now()', () => {
    vi.useFakeTimers({ now: NOW })
    try {
      expect(isExpiring(jwtExpiringIn(31, NOW))).toBe(false)
      expect(isExpiring(jwtExpiringIn(29, NOW))).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})
