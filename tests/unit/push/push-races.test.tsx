import { act, cleanup, render, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ForegroundPush } from '@/features/push/firebase'
import { PushReregister, TOKEN_CHECK_MS } from '@/features/push/push-reregister'
import {
  abandonPushWork,
  clearPushState,
  readPushState,
  savePushState,
} from '@/features/push/push-storage'
import { useWebPush } from '@/features/push/use-web-push'
import { OWNER, pushProviders, stubPushBrowser, unstubPushBrowser } from './support'

// Turning push off (or logging out) while a token check or a re-register is on its way: that step
// must not write the registration back, post a token, or start listening again afterwards.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadMessaging: vi.fn(),
  getToken: vi.fn(),
  listener: null as ((push: ForegroundPush) => void) | null,
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const STORED = { token: 'stored-token', owner: OWNER, checkedAt: Date.now() }
let idle: (() => void)[] = []

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const posts = () =>
  mocks.bffFetch.mock.calls.filter(
    ([path, init]) => path === 'devices/' && (init as { method: string }).method === 'POST',
  )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  idle = []
  stubPushBrowser({ permission: 'granted' })
  vi.stubGlobal('requestIdleCallback', (run: () => void) => idle.push(run))
  vi.stubGlobal('cancelIdleCallback', () => {})
  mocks.listener = null
  mocks.loadMessaging.mockResolvedValue({
    getToken: mocks.getToken,
    deleteToken: vi.fn(async () => {}),
    onMessage: (listener: (push: ForegroundPush) => void) => {
      mocks.listener = listener
      return () => (mocks.listener = null)
    },
  })
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
})

afterEach(() => {
  cleanup()
  unstubPushBrowser()
})

describe('turning push off while the inbox’s token check is on its way', () => {
  it.each([
    ['a rotated token', 'rotated-token'],
    ['the same token', 'stored-token'],
  ])(
    '%s answered after the switch went off: nothing stored, posted or listened to',
    async (_label, answer) => {
      savePushState(STORED)
      const token = deferred<string>()
      mocks.getToken.mockReturnValue(token.promise)
      const { result } = renderHook(useWebPush, { wrapper: pushProviders().wrapper })
      await waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
      act(() => result.current.disable())
      token.resolve(answer)
      await waitFor(() => expect(result.current.status).toBe('off'))
      expect(readPushState()).toBeNull()
      expect(posts()).toEqual([])
      expect(mocks.listener).toBeNull()
      expect(mocks.bffFetch).toHaveBeenCalledWith('devices/unregister/', {
        method: 'DELETE',
        body: { registration_id: 'stored-token' },
      })
    },
  )
})

describe('the re-register effect against a registration forgotten meanwhile', () => {
  it('push turned off (or a logout) before the idle run: nothing is posted', async () => {
    savePushState(STORED)
    render(<PushReregister />, { wrapper: pushProviders().wrapper })
    await waitFor(() => expect(idle).toHaveLength(1))
    act(() => clearPushState())
    act(() => idle[0]!())
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(posts()).toEqual([])
  })

  it('a daily check that was abandoned (push off meanwhile) posts nothing as a fallback', async () => {
    savePushState({ ...STORED, checkedAt: Date.now() - TOKEN_CHECK_MS - 1 })
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    render(<PushReregister />, { wrapper: pushProviders().wrapper })
    await waitFor(() => expect(idle).toHaveLength(1))
    act(() => idle[0]!())
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    act(() => abandonPushWork())
    token.resolve('rotated-token')
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(posts()).toEqual([])
  })

  it('a daily check that fails backs off a day (no Firebase on every page) and posts the stored token', async () => {
    savePushState({ ...STORED, checkedAt: Date.now() - TOKEN_CHECK_MS - 1 })
    mocks.getToken.mockRejectedValue(new Error('messaging/token-subscribe-failed'))
    render(<PushReregister />, { wrapper: pushProviders().wrapper })
    await waitFor(() => expect(idle).toHaveLength(1))
    act(() => idle[0]!())
    await waitFor(() => expect(posts()).toHaveLength(1))
    expect(posts()[0]![1]).toEqual({
      method: 'POST',
      body: { registration_id: 'stored-token', type: 'web' },
    })
    expect(Date.now() - readPushState()!.checkedAt).toBeLessThan(5_000)
  })
})
