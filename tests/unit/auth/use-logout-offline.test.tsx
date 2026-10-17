import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout } from '@/features/auth/use-logout'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'
import { SARA } from './fixtures'

// Logout without a connection: the request never reached the BFF (`status` 0), so the httpOnly
// session cookies are still there and the next page load would be signed in again. The tab
// keeps the session and says the logout did not happen; «خروج» can be pressed again.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    logout: vi.fn(),
    logoutAll: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: { logout: mocks.logout, logoutAll: mocks.logoutAll },
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

const OFFLINE = 'خروج انجام نشد؛ اتصال اینترنت را بررسی کنید و دوباره تلاش کنید'
const PUSH = { token: 'fcm-token', owner: SARA.uuid, checkedAt: 1 }

function flagCookie(present: boolean) {
  document.cookie = present ? 'ff_auth=1; path=/' : 'ff_auth=; max-age=0; path=/'
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  flagCookie(true)
  mocks.logout.mockRejectedValue(ApiError.network(new TypeError('Failed to fetch')))
  mocks.logoutAll.mockRejectedValue(ApiError.network(new TypeError('Failed to fetch')))
})

afterEach(() => flagCookie(false))

function hook() {
  const providers = clientProviders({ hasSession: true })
  providers.client.setQueryData(ME_KEY, SARA)
  providers.client.setQueryData(['summary'], { wishlist_count: 3 })
  const rendered = renderHook(() => ({ ...useLogout(), session: useSession() }), {
    wrapper: providers.wrapper,
  })
  return { ...rendered, client: providers.client }
}

describe('useLogout without a connection', () => {
  it.each([
    ['this device', {}],
    ['every device', { all: true }],
  ])('%s: keeps the session, stays on the page and says the logout failed', async (_, options) => {
    savePushState(PUSH)
    const { result, client } = hook()
    await act(() => result.current.logout(options))
    expect(result.current.session.hasSession).toBe(true)
    expect(client.getQueryData(ME_KEY)).toEqual(SARA)
    expect(client.getQueryData(['summary'])).toEqual({ wishlist_count: 3 })
    // Web push stays on: the device was not logged out.
    expect(readPushState()).toEqual(PUSH)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.notify.success).not.toHaveBeenCalled()
    expect(mocks.notify.error).toHaveBeenCalledExactlyOnceWith(OFFLINE)
    expect(result.current.pending).toBe(false)
  })

  it('«خروج» again, once back online: signed out as usual', async () => {
    const { result } = hook()
    await act(() => result.current.logout())
    mocks.logout.mockImplementationOnce(async () => {
      flagCookie(false)
      return {}
    })
    await act(() => result.current.logout())
    expect(mocks.logout).toHaveBeenCalledTimes(2)
    expect(result.current.session.hasSession).toBe(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
    expect(mocks.notify.success).toHaveBeenCalledExactlyOnceWith('از حساب خارج شدید')
  })

  it('the answer was lost after the BFF dropped the cookies: signed out all the same', async () => {
    mocks.logout.mockImplementationOnce(async () => {
      flagCookie(false)
      throw ApiError.network(new TypeError('network error'))
    })
    const { result } = hook()
    await act(() => result.current.logout())
    expect(result.current.session.hasSession).toBe(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/')
    expect(mocks.notify.error).not.toHaveBeenCalled()
  })
})
