import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NOTIFICATIONS_KEY } from '@/features/notifications/notifications-api'
import type { ForegroundPush } from '@/features/push/firebase'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { DISABLE_FAILED, useWebPush } from '@/features/push/use-web-push'
import { ApiError } from '@/lib/api/errors'
import {
  OWNER,
  pushProviders,
  stubPushBrowser,
  unstubPushBrowser,
  type PushBrowser,
} from './support'

// Web push while it is on (dashboard digest §4.3–4.4): the inbox checks the token (a rotated one
// is registered, the old one unregistered), a permission withdrawn in the browser unregisters the
// device, pushes received in view show a toast and read the inbox again, and turning it off
// unregisters the device (`DELETE devices/unregister/` with a JSON body) and revokes the token.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadMessaging: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
  listener: null as ((push: ForegroundPush) => void) | null,
  router: { replace: vi.fn(), push: vi.fn() },
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ notify: mocks.notify, toastRegionReady: () => true }))

const TOKEN = 'stored-fcm-token'
let browser: PushBrowser

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  browser = stubPushBrowser({ permission: 'granted' })
  savePushState({ token: TOKEN, owner: OWNER, checkedAt: 1 })
  mocks.getToken.mockResolvedValue(TOKEN)
  mocks.deleteToken.mockResolvedValue(undefined)
  mocks.loadMessaging.mockResolvedValue({
    getToken: mocks.getToken,
    deleteToken: mocks.deleteToken,
    onMessage: (listener: (push: ForegroundPush) => void) => {
      mocks.listener = listener
      return () => (mocks.listener = null)
    },
  })
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
})

afterEach(() => {
  unstubPushBrowser()
})

function push() {
  const providers = pushProviders()
  return { ...renderHook(useWebPush, { wrapper: providers.wrapper }), client: providers.client }
}

const devicesCalls = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => String(path).startsWith('devices/'))

describe('useWebPush while push is on', () => {
  it('checks the token through the existing worker; the same token sends nothing', async () => {
    const { result } = push()
    expect(result.current.status).toBe('on')
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalledWith(browser.registration))
    await waitFor(() => expect(readPushState()!.checkedAt).toBeGreaterThan(1))
    expect(browser.register).not.toHaveBeenCalled()
    expect(devicesCalls()).toEqual([])
  })

  it('a rotated token: registers the new one, unregisters the old one, keeps the new one', async () => {
    mocks.getToken.mockResolvedValue('rotated-token')
    push()
    await waitFor(() => expect(readPushState()?.token).toBe('rotated-token'))
    expect(devicesCalls()).toEqual([
      [
        'devices/',
        {
          method: 'POST',
          body: expect.objectContaining({ registration_id: 'rotated-token', type: 'web' }),
        },
      ],
      ['devices/unregister/', { method: 'DELETE', body: { registration_id: TOKEN } }],
    ])
  })

  it('permission withdrawn in the browser’s settings: unregistered and forgotten', async () => {
    browser = stubPushBrowser({ permission: 'default' })
    const { result } = push()
    expect(result.current.status).toBe('off')
    await waitFor(() => expect(readPushState()).toBeNull())
    expect(devicesCalls()).toEqual([
      ['devices/unregister/', { method: 'DELETE', body: { registration_id: TOKEN } }],
    ])
    expect(mocks.loadMessaging).not.toHaveBeenCalled()
  })

  it('a push in view: a toast with its title and text (the worker’s word reads the inbox again)', async () => {
    const { client } = push()
    client.setQueryData(NOTIFICATIONS_KEY, { pages: [], pageParams: [] })
    await waitFor(() => expect(mocks.listener).not.toBeNull())
    act(() => mocks.listener!({ title: 'جشنواره', body: 'تا ۴۰ درصد تخفیف' }))
    expect(mocks.notify.info).toHaveBeenCalledWith('جشنواره', { description: 'تا ۴۰ درصد تخفیف' })
    // One read again per push: `useInboxRefresh`'s, on the same event.
    expect(client.getQueryState(NOTIFICATIONS_KEY)?.isInvalidated).toBe(false)
  })

  it('turning it off: DELETE devices/unregister/ with the token in a JSON body, then revoked and forgotten', async () => {
    const { result } = push()
    await waitFor(() => expect(mocks.listener).not.toBeNull())
    act(() => result.current.disable())
    expect(result.current.status).toBe('disabling')
    await waitFor(() => expect(result.current.status).toBe('off'))
    expect(devicesCalls()).toEqual([
      ['devices/unregister/', { method: 'DELETE', body: { registration_id: TOKEN } }],
    ])
    expect(mocks.deleteToken).toHaveBeenCalledTimes(1)
    expect(readPushState()).toBeNull()
    expect(browser.calls).toContain('unsubscribe')
    // No more toasts from a push once it is off.
    expect(mocks.listener).toBeNull()
  })

  it('the API cannot be told: push stays on and says so', async () => {
    const { result } = push()
    await waitFor(() => expect(mocks.listener).not.toBeNull())
    mocks.bffFetch.mockRejectedValueOnce(ApiError.network())
    act(() => result.current.disable())
    await waitFor(() => expect(result.current.error).toBe(DISABLE_FAILED))
    expect(result.current.status).toBe('on')
    expect(readPushState()?.token).toBe(TOKEN)
  })
})
