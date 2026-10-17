import { act, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearPushState, readPushState } from '@/features/push/push-storage'
import { ENABLE_FAILED, useWebPush } from '@/features/push/use-web-push'
import { ApiError } from '@/lib/api/errors'
import { pushProviders, stubPushBrowser, unstubPushBrowser, type PushBrowser } from './support'

// Turning web push on (dashboard digest §4.3–4.4), only from the visitor's gesture and only when
// the shop has Firebase: the permission prompt, then `/sw.js`, then Firebase's token through that
// worker's registration, then `POST devices/` with this browser's label. Any step that fails
// leaves push off and says so; nothing of Firebase loads without the shop's config.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadMessaging: vi.fn(),
  getToken: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const TOKEN = 'fresh-fcm-token'
const CHROME_ON_WINDOWS =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
let browser: PushBrowser

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  browser = stubPushBrowser()
  vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(CHROME_ON_WINDOWS)
  mocks.getToken.mockImplementation(async () => {
    browser.calls.push('getToken')
    return TOKEN
  })
  mocks.loadMessaging.mockResolvedValue({
    getToken: mocks.getToken,
    deleteToken: vi.fn(async () => {}),
    onMessage: vi.fn(() => () => {}),
  })
  mocks.bffFetch.mockImplementation(async (path: string, { method = 'GET' } = {}) => {
    browser.calls.push(`${method} ${path}`)
    return { data: {}, msg: '', status: 201 }
  })
})

afterEach(() => {
  unstubPushBrowser()
  vi.restoreAllMocks()
})

function push(options: Parameters<typeof pushProviders>[0] = {}) {
  return renderHook(useWebPush, { wrapper: pushProviders(options).wrapper })
}

describe('useWebPush', () => {
  it.each([
    ['the switch off', false],
    ['the switch on but no config', true],
  ])(
    'reports supported: false with a null Firebase config (%s), and loads nothing',
    async (_label, webPush) => {
      const { result } = push({ firebase: null, webPush })
      expect(result.current.supported).toBe(false)
      expect(result.current.status).toBe('unavailable')
      act(() => result.current.enable())
      await new Promise((resolve) => setTimeout(resolve, 20))
      expect(browser.requestPermission).not.toHaveBeenCalled()
      expect(mocks.loadMessaging).not.toHaveBeenCalled()
      expect(mocks.bffFetch).not.toHaveBeenCalled()
    },
  )

  it('a browser without web push (iOS Safari, not installed): unsupported', () => {
    unstubPushBrowser()
    const { result } = push()
    expect(result.current).toMatchObject({ supported: false, status: 'unsupported' })
  })

  it('off until the visitor turns it on: permission, worker, token, then the API, in that order', async () => {
    const { result } = push()
    expect(result.current).toMatchObject({ supported: true, status: 'off' })
    expect(browser.requestPermission).not.toHaveBeenCalled()
    act(() => result.current.enable())
    expect(result.current.status).toBe('enabling')
    await waitFor(() => expect(result.current.status).toBe('on'))
    expect(browser.calls).toEqual(['permission', 'register', 'getToken', 'POST devices/'])
    expect(browser.register).toHaveBeenCalledWith('/sw.js', { scope: '/' })
    expect(mocks.getToken).toHaveBeenCalledWith(browser.registration)
    expect(mocks.bffFetch).toHaveBeenCalledWith('devices/', {
      method: 'POST',
      body: { registration_id: TOKEN, type: 'web', name: 'Chrome روی Windows' },
    })
    expect(readPushState()).toMatchObject({ token: TOKEN })
    expect(result.current.error).toBeNull()
  })

  it('permission refused: blocked, and nothing more is done', async () => {
    browser = stubPushBrowser({ answer: 'denied' })
    const { result } = push()
    act(() => result.current.enable())
    await waitFor(() => expect(result.current.status).toBe('denied'))
    expect(browser.calls).toEqual(['permission'])
    expect(result.current.error).toBeNull()
  })

  it('the prompt dismissed: still off, no error', async () => {
    browser = stubPushBrowser({ answer: 'default' })
    const { result } = push()
    act(() => result.current.enable())
    await waitFor(() => expect(result.current.status).toBe('off'))
    expect(browser.calls).toEqual(['permission'])
  })

  it.each([
    [
      'the worker cannot register',
      () => browser.register.mockRejectedValueOnce(new Error('x')),
      ['permission'],
    ],
    [
      'Firebase cannot be downloaded',
      () => mocks.loadMessaging.mockRejectedValueOnce(new Error('chunk')),
      ['permission', 'register'],
    ],
    [
      'Firebase gives no token',
      () => mocks.getToken.mockRejectedValueOnce(new Error('messaging/token-subscribe-failed')),
      ['permission', 'register'],
    ],
    [
      'the API refuses the device',
      () => mocks.bffFetch.mockRejectedValueOnce(new ApiError({ status: 500 })),
      ['permission', 'register', 'getToken'],
    ],
  ])('%s: off, says so, stores nothing', async (_label, arrange, done) => {
    arrange()
    const { result } = push()
    act(() => result.current.enable())
    await waitFor(() => expect(result.current.status).toBe('off'))
    expect(result.current.error).toBe(ENABLE_FAILED)
    expect(browser.calls).toEqual(done)
    expect(readPushState()).toBeNull()
  })

  it('a session that is gone when the device is sent: login', async () => {
    mocks.bffFetch.mockRejectedValueOnce(new ApiError({ status: 401, code: 'not_authenticated' }))
    const { result } = push()
    act(() => result.current.enable())
    await waitFor(() => expect(mocks.router.push).toHaveBeenCalled())
    expect(readPushState()).toBeNull()
  })

  it('a logout while it is being turned on: nothing posted or stored, and no error', async () => {
    let answer: (token: string) => void = () => {}
    mocks.getToken.mockImplementationOnce(() => new Promise((resolve) => (answer = resolve)))
    const { result } = push()
    act(() => result.current.enable())
    await waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    act(() => clearPushState())
    act(() => answer(TOKEN))
    await waitFor(() => expect(result.current.status).toBe('off'))
    expect(result.current.error).toBeNull()
    expect(browser.calls).not.toContain('POST devices/')
    expect(readPushState()).toBeNull()
  })
})
