import { describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { withSessionExpiry } from '@/lib/session/with-session-expiry'

// One wrapper for every session-only read: a 401 that means the session is gone ends it
// (`expire`, see useSessionExpired) and stays the read's error, or turns into the read's
// "nobody" value when one is given. Anything else is left alone.

const gone = () => new ApiError({ status: 401, code: 'token_not_valid' })

describe('withSessionExpiry', () => {
  it('passes the arguments in and the value out, the session untouched', async () => {
    const expire = vi.fn()
    const read = vi.fn(async (page: number, signal: AbortSignal) => ({
      page,
      aborted: signal.aborted,
    }))
    const signal = new AbortController().signal
    await expect(withSessionExpiry(read, expire)(2, signal)).resolves.toEqual({
      page: 2,
      aborted: false,
    })
    expect(read).toHaveBeenCalledWith(2, signal)
    expect(expire).not.toHaveBeenCalled()
  })

  it('a session that is gone: ends it, and the error stays the read’s', async () => {
    const expire = vi.fn()
    const error = gone()
    await expect(withSessionExpiry(() => Promise.reject(error), expire)()).rejects.toBe(error)
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it('with a value for nobody: ends the session and resolves to it', async () => {
    const expire = vi.fn()
    const read = withSessionExpiry(
      () => Promise.reject(gone()),
      expire,
      () => null,
    )
    await expect(read()).resolves.toBeNull()
    expect(expire).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['a server error', new ApiError({ status: 500, code: 'http_500' })],
    ['a bad API key (no session problem)', new ApiError({ status: 401, code: 'api_key_invalid' })],
    ['a lost connection', ApiError.network()],
    ['an abort', new DOMException('aborted', 'AbortError')],
  ])('%s: rethrown as it is, the session untouched', async (_, error) => {
    const expire = vi.fn()
    const read = withSessionExpiry(
      () => Promise.reject(error),
      expire,
      () => null,
    )
    await expect(read()).rejects.toBe(error)
    expect(expire).not.toHaveBeenCalled()
  })
})
