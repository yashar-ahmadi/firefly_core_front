import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useCompleteLogin } from '@/features/auth/components/post-login'
import { LazyPushReregister } from '@/features/push/lazy-push-reregister'
import { PushReregister } from '@/features/push/push-reregister'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { useWebPush } from '@/features/push/use-web-push'
import { SARA } from '../auth/fixtures'
import { clientProviders } from '../support/providers'
import {
  OWNER,
  pushProviders,
  stubPushBrowser,
  unstubPushBrowser,
  type PushBrowser,
} from './support'

// A push registration belongs to the account it was turned on for. A session can end unseen (the
// refresh cookie expires while the visitor is away: no 401 ever reaches the page), so the next
// account to sign in on this browser must never inherit it: it is forgotten (the browser's
// subscription too) instead of being posted for them; the same account goes on as before.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadMessaging: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const ANOTHER = {
  token: 'previous-users-token',
  owner: 'another-account-uuid',
  checkedAt: Date.now(),
}
const SARAS = { token: 'saras-token', owner: OWNER, checkedAt: Date.now() }
let browser: PushBrowser

const devicesCalls = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => String(path).startsWith('devices/'))
const unsubscribed = () => browser.calls.filter((call) => call === 'unsubscribe').length

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  browser = stubPushBrowser({ permission: 'granted' })
  vi.stubGlobal('requestIdleCallback', (run: () => void) => setTimeout(run, 0))
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id))
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
  mocks.loadMessaging.mockResolvedValue({
    getToken: async () => 'saras-token',
    deleteToken: async () => {},
    onMessage: () => () => {},
  })
})

afterEach(() => {
  cleanup()
  unstubPushBrowser()
})

describe('the re-register effect and the account', () => {
  it('another account’s registration: forgotten with its subscription, nothing posted', async () => {
    savePushState(ANOTHER)
    render(<PushReregister />, { wrapper: pushProviders().wrapper })
    await waitFor(() => expect(readPushState()).toBeNull())
    await waitFor(() => expect(unsubscribed()).toBe(1))
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(devicesCalls()).toEqual([])
  })

  it('signed out with a registration still stored: forgotten with its subscription', async () => {
    savePushState(SARAS)
    // The shop layout's gate does it, without the re-register chunk.
    render(<LazyPushReregister />, { wrapper: pushProviders({ hasSession: false }).wrapper })
    await waitFor(() => expect(readPushState()).toBeNull())
    await waitFor(() => expect(unsubscribed()).toBe(1))
    expect(devicesCalls()).toEqual([])
  })

  it('the same account: posted again as before', async () => {
    savePushState(SARAS)
    render(<PushReregister />, { wrapper: pushProviders().wrapper })
    await waitFor(() =>
      expect(devicesCalls()).toEqual([
        ['devices/', { method: 'POST', body: { registration_id: 'saras-token', type: 'web' } }],
      ]),
    )
    expect(readPushState()).toEqual(SARAS)
    expect(unsubscribed()).toBe(0)
  })
})

describe('the inbox’s switch and the account', () => {
  it('another account’s registration reads as off, is forgotten and never checked', async () => {
    savePushState(ANOTHER)
    const { result } = renderHook(useWebPush, { wrapper: pushProviders().wrapper })
    expect(result.current.status).toBe('off')
    await waitFor(() => expect(readPushState()).toBeNull())
    expect(mocks.loadMessaging).not.toHaveBeenCalled()
    expect(devicesCalls()).toEqual([])
  })

  it('turning it on keeps the account with the token', async () => {
    browser = stubPushBrowser({ permission: 'default' })
    const { result } = renderHook(useWebPush, { wrapper: pushProviders().wrapper })
    act(() => result.current.enable())
    await waitFor(() => expect(result.current.status).toBe('on'))
    expect(readPushState()).toMatchObject({ token: 'saras-token', owner: OWNER })
  })
})

describe('a login and the account', () => {
  function complete() {
    mocks.bffFetch.mockResolvedValue({ data: null, msg: '', status: 200 })
    return renderHook(useCompleteLogin, { wrapper: clientProviders({ hasSession: false }).wrapper })
  }
  const signedIn = { user: SARA, requires_totp: false, remember_me: true }

  it('another account’s registration is forgotten with its subscription', async () => {
    savePushState(ANOTHER)
    const { result } = complete()
    await act(() => result.current(signedIn, '/account/'))
    expect(readPushState()).toBeNull()
    await waitFor(() => expect(unsubscribed()).toBe(1))
  })

  it('the same account’s is kept', async () => {
    savePushState(SARAS)
    const { result } = complete()
    await act(() => result.current(signedIn, '/account/'))
    expect(readPushState()).toEqual(SARAS)
    expect(unsubscribed()).toBe(0)
  })
})
