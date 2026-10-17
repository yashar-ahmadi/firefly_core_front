import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout } from '@/features/auth/use-logout'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { clientProviders } from '../support/providers'
import { OWNER } from './support'

// Web push and the session's end (dashboard digest §4.3, step 5): a logout sends this browser's
// token with the refresh token (`{refresh, registration_id}`: the BFF adds the refresh cookie),
// so the API deactivates the device before the session goes; logout-all deactivates every device
// itself. Either way, and when the session ended by itself (no request possible), the browser
// forgets its push registration: the stored token, and its push subscription.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    logout: vi.fn(),
    logoutAll: vi.fn(),
    router: { replace, push: vi.fn() },
    replace,
    unsubscribe: vi.fn(async () => true),
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: { logout: mocks.logout, logoutAll: mocks.logoutAll },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn(async () => ({ data: {} })) }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

const TOKEN = 'fcm-token-of-this-browser'

/** A browser with `/sw.js` registered and a push subscription. */
function stubServiceWorker() {
  const registration = {
    pushManager: { getSubscription: async () => ({ unsubscribe: mocks.unsubscribe }) },
  }
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: { getRegistration: vi.fn(async () => registration) },
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  mocks.logout.mockResolvedValue({})
  mocks.logoutAll.mockResolvedValue({})
  stubServiceWorker()
})

afterEach(() => {
  Reflect.deleteProperty(navigator, 'serviceWorker')
  window.history.replaceState(null, '', '/')
})

function logoutHook() {
  return renderHook(useLogout, { wrapper: clientProviders({ hasSession: true }).wrapper })
}

describe('logout and web push', () => {
  it('sends this browser’s token with the logout, then forgets it and its subscription', async () => {
    savePushState({ token: TOKEN, owner: OWNER, checkedAt: 1 })
    const { result } = logoutHook()
    await act(() => result.current.logout())
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith({ registration_id: TOKEN })
    expect(readPushState()).toBeNull()
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1))
  })

  it('nothing stored: the logout sends no token, and a subscription left is still dropped', async () => {
    // Without storage push was on for one page only: its subscription may be there all the same.
    const { result } = logoutHook()
    await act(() => result.current.logout())
    expect(mocks.logout).toHaveBeenCalledExactlyOnceWith()
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1))
  })

  it('logout-all deactivates every device itself: no token sent, still forgotten here', async () => {
    savePushState({ token: TOKEN, owner: OWNER, checkedAt: 1 })
    const { result } = logoutHook()
    await act(() => result.current.logout({ all: true }))
    expect(mocks.logoutAll).toHaveBeenCalledExactlyOnceWith()
    expect(readPushState()).toBeNull()
  })

  it('a failed logout request still forgets the token here (the session is gone anyway)', async () => {
    savePushState({ token: TOKEN, owner: OWNER, checkedAt: 1 })
    mocks.logout.mockRejectedValue(new Error('offline'))
    const { result } = logoutHook()
    await act(() => result.current.logout())
    expect(readPushState()).toBeNull()
  })
})

describe('a session that ended by itself and web push', () => {
  it('nothing stored (no storage): the browser’s subscription still goes', async () => {
    const { result } = renderHook(useSessionExpired, {
      wrapper: clientProviders({ hasSession: true }).wrapper,
    })
    act(() => result.current())
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1))
  })

  it('forgets the token and the subscription, asking nothing of the API', async () => {
    savePushState({ token: TOKEN, owner: OWNER, checkedAt: 1 })
    const { result } = renderHook(useSessionExpired, {
      wrapper: clientProviders({ hasSession: true }).wrapper,
    })
    act(() => result.current())
    expect(readPushState()).toBeNull()
    await waitFor(() => expect(mocks.unsubscribe).toHaveBeenCalledTimes(1))
  })
})
