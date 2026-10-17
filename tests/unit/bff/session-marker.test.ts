// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { jwtExpiringIn } from '../support/jwt'
import {
  bff,
  envelope,
  isCleared,
  loadHandler,
  refreshCalls,
  setCookies,
  stubEnv,
  type FetchSpy,
} from './support'

// The session flag cookie (`ff_auth`) carries an opaque marker of the login it belongs to: a
// random value minted by the BFF for every login (password, code, Google, registration), kept
// while that session lives (access-token refreshes, a password change), gone with the session.
// A tab compares it with the one it loaded with: another value means another login happened in
// another tab (AccountSessionWatch). Never a user id, never derived from a token.

const MARKER = /^[A-Za-z0-9_-]{16,64}$/

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: true }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

function tokens() {
  return { access: jwtExpiringIn(900), refresh: jwtExpiringIn(2_592_000) }
}

async function logIn(path = 'account/auth/login/', cookies: Record<string, string> = {}) {
  const pair = tokens()
  fetchSpy.mockResolvedValue(envelope({ user: { uuid: 'user-uuid-1' }, tokens: pair }))
  const handleBff = await loadHandler()
  const res = await handleBff(...bff(path, { method: 'POST', json: {}, cookies }))
  return { cookies: setCookies(res), pair }
}

describe('the session marker in ff_auth', () => {
  it.each([
    'account/auth/login/',
    'account/auth/login/otp/verify/',
    'account/auth/google/',
    'account/auth/register/complete/',
  ])('a login (%s) mints a random marker, alive as long as the refresh cookie', async (path) => {
    const { cookies, pair } = await logIn(path)
    const marker = cookies.ff_auth?.value ?? ''
    expect(marker).toMatch(MARKER)
    expect(marker).not.toBe('1')
    // Opaque: neither the account nor any part of a token.
    expect(marker).not.toContain('user-uuid-1')
    for (const token of [pair.access, pair.refresh]) {
      for (const part of token.split('.')) expect(part).not.toContain(marker)
    }
    expect(cookies.ff_auth?.attrs.httponly).toBeUndefined()
    expect(cookies.ff_auth?.attrs['max-age']).toBe(cookies.ff_rt?.attrs['max-age'])
  })

  it('every login gets its own marker, also over a session that is still there', async () => {
    const first = (await logIn()).cookies.ff_auth?.value
    const second = (await logIn('account/auth/login/', { ff_auth: first ?? '' })).cookies.ff_auth
    expect(second?.value).toMatch(MARKER)
    expect(second?.value).not.toBe(first)
  })

  it('a password change keeps the session, and its marker', async () => {
    const marker = 'kept-marker-0123456789'
    const path = 'account/profile/password/change/'
    const session = { ff_at: jwtExpiringIn(600), ff_rt: jwtExpiringIn(9999), ff_auth: marker }
    const { cookies } = await logIn(path, session)
    expect(cookies.ff_rt).toBeDefined()
    expect(cookies.ff_auth?.value).toBe(marker)
  })

  it('a password change without a usable marker gets a new one', async () => {
    const path = 'account/profile/password/change/'
    const { cookies } = await logIn(path, { ff_auth: 'no spaces%20allowed' })
    expect(cookies.ff_auth?.value).toMatch(MARKER)
  })

  it('a refresh before a call leaves the marker alone', async () => {
    fetchSpy.mockImplementation(async (input) =>
      String(input).endsWith('account/auth/token/refresh/')
        ? envelope({ access: jwtExpiringIn(900) })
        : envelope({ uuid: 'u' }),
    )
    const handleBff = await loadHandler()
    const cookies = { ff_rt: jwtExpiringIn(9999), ff_auth: 'kept-marker-0123456789' }
    const res = await handleBff(...bff('account/profile/me/', { cookies }))
    expect(refreshCalls(fetchSpy)).toHaveLength(1)
    expect(setCookies(res).ff_at).toBeDefined()
    expect(setCookies(res).ff_auth).toBeUndefined()
  })

  it('a logout clears it with the session', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(
      ...bff('account/auth/logout/', {
        method: 'POST',
        json: {},
        cookies: { ff_rt: jwtExpiringIn(9999), ff_auth: 'kept-marker-0123456789' },
      }),
    )
    expect(isCleared(setCookies(res).ff_auth)).toBe(true)
  })
})
