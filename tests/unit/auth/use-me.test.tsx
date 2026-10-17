import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMe } from '@/features/auth/use-me'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'
import { useSession } from '@/lib/session/session-context'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))

const SARA = {
  uuid: 'a39a75e3-9c58-43f7-8a2c-3dce983629f8',
  username: 'sara.ahmadi',
  first_name: 'سارا',
  last_name: 'احمدی',
  full_name: 'سارا احمدی',
  email: 'sara.ahmadi@example.com',
  phone_number: '+989121234501',
  is_email_verified: true,
  is_phone_verified: true,
  avatar_picture: null,
  created: '2025-09-18T15:00:00+03:30',
  is_totp_enabled: false,
  has_usable_password: true,
} satisfies UserProfile

const gone = () => new ApiError({ status: 401, code: 'not_authenticated', detail: 'وارد شوید' })

function renderMe(hasSession: boolean, defaults: { retry?: false } = {}) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryDefaults(['me'], defaults)
  const hook = renderHook(() => ({ me: useMe(), session: useSession() }), {
    wrapper: providers.wrapper,
  })
  return { ...hook, client: providers.client }
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

describe('useMe', () => {
  it('asks nothing without a session', async () => {
    const { result } = renderMe(false)
    await act(async () => {})
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(result.current.me.data).toBeUndefined()
    expect(result.current.me.fetchStatus).toBe('idle')
  })

  it("reads the signed-in visitor's profile under ['me']", async () => {
    mocks.bffFetch.mockResolvedValue({ data: SARA, msg: '', status: 200 })
    const { result, client } = renderMe(true)
    await waitFor(() => expect(result.current.me.data).toEqual(SARA))
    expect(mocks.bffFetch).toHaveBeenCalledWith('account/profile/me/', {
      signal: expect.any(AbortSignal),
    })
    expect(client.getQueryData(['me'])).toEqual(SARA)
  })

  it('resolves a 401 to null and ends the session, without asking again', async () => {
    mocks.bffFetch.mockRejectedValue(gone())
    const { result, client } = renderMe(true)
    await waitFor(() => expect(result.current.session.hasSession).toBe(false))
    await waitFor(() => expect(result.current.me.data).toBeNull())
    expect(result.current.me.isError).toBe(false)
    expect(client.getQueryData(['me'])).toBeNull()

    // Another component asking for the profile later makes no request: there is no session.
    const later = renderHook(() => useMe(), {
      wrapper: clientProviders({ hasSession: false, client }).wrapper,
    })
    await act(async () => {})
    expect(later.result.current.data).toBeNull()
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
  })

  it('on a public page stays there: the header turns into the guest one', async () => {
    window.history.replaceState(null, '', '/product/samsung-galaxy-s25-ultra/')
    mocks.bffFetch.mockRejectedValue(gone())
    const { result } = renderMe(true)
    await waitFor(() => expect(result.current.session.hasSession).toBe(false))
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('on an account page goes to login with the page as next, once', async () => {
    window.history.replaceState(null, '', '/account/addresses/?page=2')
    mocks.bffFetch.mockRejectedValue(gone())
    const { result } = renderMe(true)
    await waitFor(() => expect(result.current.session.hasSession).toBe(false))
    expect(mocks.replace).toHaveBeenCalledWith('/login/?next=/account/addresses/%3Fpage%3D2')
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it.each([
    ['a server error', new ApiError({ status: 500, code: 'server_error' })],
    ['a lost connection', ApiError.network()],
    // A configuration problem is no expired session: never send the visitor to login for it.
    ['a missing API key', new ApiError({ status: 401, code: 'api_key_missing' })],
  ])('keeps %s an error and the session as it was', async (_label, error) => {
    mocks.bffFetch.mockRejectedValue(error)
    const { result } = renderMe(true, { retry: false })
    await waitFor(() => expect(result.current.me.isError).toBe(true))
    expect(result.current.me.error).toBe(error)
    expect(result.current.session.hasSession).toBe(true)
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
