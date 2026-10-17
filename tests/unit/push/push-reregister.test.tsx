import { cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushReregister, TOKEN_CHECK_MS } from '@/features/push/push-reregister'
import { readPushState, savePushState } from '@/features/push/push-storage'
import { pushProviders, stubPushBrowser, unstubPushBrowser } from './support'

// The re-register effect on every shop page (dashboard digest §4.3, step 2): while push is on and
// the visitor is signed in, the stored token is posted again once the browser is idle, without
// Firebase; once a day the token check (Firebase, in its own chunk) runs instead.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  flowLoaded: vi.fn(),
  refreshToken: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/push-flow', () => {
  mocks.flowLoaded()
  return { refreshToken: mocks.refreshToken }
})
vi.mock('@/features/push/firebase', () => {
  throw new Error('Firebase must not be loaded by the re-register effect')
})

const TOKEN = 'stored-fcm-token'

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  localStorage.clear()
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
  mocks.refreshToken.mockResolvedValue({})
  vi.stubGlobal('requestIdleCallback', (run: () => void) => setTimeout(run, 0))
  vi.stubGlobal('cancelIdleCallback', (id: number) => clearTimeout(id))
})

afterEach(() => {
  cleanup()
  unstubPushBrowser()
})

function mount(options: Parameters<typeof pushProviders>[0] = {}) {
  return render(<PushReregister />, { wrapper: pushProviders(options).wrapper })
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

describe('PushReregister', () => {
  it('posts the stored token again once idle, without Firebase, and keeps the device’s name', async () => {
    stubPushBrowser({ permission: 'granted' })
    savePushState({ token: TOKEN, checkedAt: Date.now() - 1000 })
    mount()
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
    expect(mocks.bffFetch).toHaveBeenCalledWith('devices/', {
      method: 'POST',
      body: { registration_id: TOKEN, type: 'web' },
    })
    expect(mocks.flowLoaded).not.toHaveBeenCalled()
  })

  it.each([
    ['without a session', { hasSession: false }, true],
    ['without the shop’s Firebase config', { firebase: null }, true],
    ['without push on in this browser', {}, false],
  ] as const)('does nothing %s', async (_label, options, stored) => {
    stubPushBrowser({ permission: 'granted' })
    if (stored) savePushState({ token: TOKEN, checkedAt: Date.now() })
    mount(options)
    await settle()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(mocks.flowLoaded).not.toHaveBeenCalled()
  })

  it('permission withdrawn in the browser: unregisters the device and forgets it', async () => {
    stubPushBrowser({ permission: 'denied' })
    savePushState({ token: TOKEN, checkedAt: Date.now() })
    mount()
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledExactlyOnceWith('devices/unregister/', {
        method: 'DELETE',
        body: { registration_id: TOKEN },
      }),
    )
    expect(readPushState()).toBeNull()
  })

  it('a day after the last check: the token check instead (it posts a rotated token itself)', async () => {
    stubPushBrowser({ permission: 'granted' })
    const stored = { token: TOKEN, checkedAt: Date.now() - TOKEN_CHECK_MS - 1 }
    savePushState(stored)
    mount()
    await waitFor(() => expect(mocks.refreshToken).toHaveBeenCalledTimes(1))
    expect(mocks.refreshToken.mock.calls[0]![1]).toEqual(stored)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('a token check that fails (Firebase unreachable) still posts the stored token', async () => {
    stubPushBrowser({ permission: 'granted' })
    savePushState({ token: TOKEN, checkedAt: 0 })
    mocks.refreshToken.mockRejectedValue(new Error('chunk failed'))
    mount()
    await waitFor(() =>
      expect(mocks.bffFetch).toHaveBeenCalledWith('devices/', {
        method: 'POST',
        body: { registration_id: TOKEN, type: 'web' },
      }),
    )
  })
})
