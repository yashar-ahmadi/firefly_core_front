import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PushAbandoned, refreshToken, subscribe } from '@/features/push/push-flow'
import {
  abandonPushWork,
  clearPushState,
  pushMark,
  readPushState,
  savePushState,
  settlePushWork,
} from '@/features/push/push-storage'
import { FIREBASE, OWNER, stubPushBrowser, unstubPushBrowser } from './support'

// The token check (an FCM token can rotate) runs over the network: a disable, a logout or the
// session's end that comes meanwhile must not be undone by it. It checks the registration before
// every write, a token it posted for nothing is unregistered again, and a disable can wait for it.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadMessaging: vi.fn(),
  getToken: vi.fn(),
  deleteToken: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))

const STORED = { token: 'stored-token', owner: OWNER, checkedAt: 1 }

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

const devices = () =>
  mocks.bffFetch.mock.calls
    .filter(([path]) => String(path).startsWith('devices/'))
    .map(
      ([path, init]) =>
        `${(init as { method: string }).method} ${path} ${JSON.stringify((init as { body: unknown }).body)}`,
    )

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  stubPushBrowser({ permission: 'granted' })
  savePushState(STORED)
  mocks.loadMessaging.mockResolvedValue({
    getToken: mocks.getToken,
    deleteToken: mocks.deleteToken.mockResolvedValue(undefined),
    onMessage: vi.fn(),
  })
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
})

afterEach(() => {
  unstubPushBrowser()
})

describe('refreshToken', () => {
  it('a rotated token: posted, the old one unregistered, kept with its owner', async () => {
    mocks.getToken.mockResolvedValue('rotated-token')
    await refreshToken(FIREBASE, STORED, pushMark())
    expect(devices()).toEqual([
      expect.stringMatching(/^POST devices\/ \{"registration_id":"rotated-token","type":"web"/),
      'DELETE devices/unregister/ {"registration_id":"stored-token"}',
    ])
    expect(readPushState()).toMatchObject({ token: 'rotated-token', owner: OWNER })
  })

  it('abandoned while Firebase answers: nothing posted, nothing stored', async () => {
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    const check = refreshToken(FIREBASE, STORED, pushMark())
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    abandonPushWork()
    token.resolve('rotated-token')
    await expect(check).rejects.toThrow()
    expect(devices()).toEqual([])
    expect(readPushState()).toEqual(STORED)
  })

  it('abandoned while its rotated token is being posted: that token is unregistered again', async () => {
    mocks.getToken.mockResolvedValue('rotated-token')
    const posted = deferred<unknown>()
    mocks.bffFetch.mockImplementationOnce(() => posted.promise)
    const check = refreshToken(FIREBASE, STORED, pushMark())
    await vi.waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
    abandonPushWork()
    posted.resolve({ data: {}, msg: '', status: 201 })
    await expect(check).rejects.toThrow()
    expect(devices()).toContain('DELETE devices/unregister/ {"registration_id":"rotated-token"}')
    expect(readPushState()).toEqual(STORED)
  })

  it('a registration forgotten meanwhile (logout, the session’s end) is not written back', async () => {
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    const check = refreshToken(FIREBASE, STORED, pushMark())
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    localStorage.clear()
    token.resolve('stored-token')
    await expect(check).rejects.toThrow()
    expect(readPushState()).toBeNull()
  })

  it('settlePushWork waits for a check on its way', async () => {
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    const check = refreshToken(FIREBASE, STORED, pushMark()).catch(() => undefined)
    let settled = false
    const waiting = settlePushWork().then(() => (settled = true))
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    expect(settled).toBe(false)
    token.resolve('stored-token')
    await waiting
    await check
    expect(settled).toBe(true)
  })
})

// Turning push on runs over the network too: a logout or the session's end meanwhile
// (`clearPushState`) must not be followed by a registration stored or a device left on.
describe('subscribe', () => {
  beforeEach(() => localStorage.clear())

  it('stores the token with its owner once the device is posted', async () => {
    mocks.getToken.mockResolvedValue('new-token')
    await subscribe(FIREBASE, OWNER)
    expect(devices()).toEqual([
      expect.stringMatching(/^POST devices\/ \{"registration_id":"new-token"/),
    ])
    expect(readPushState()).toMatchObject({ token: 'new-token', owner: OWNER })
  })

  it('a logout while Firebase answers: nothing posted or stored, the token revoked', async () => {
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    const enabling = subscribe(FIREBASE, OWNER)
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    clearPushState()
    token.resolve('new-token')
    await expect(enabling).rejects.toBeInstanceOf(PushAbandoned)
    expect(devices()).toEqual([])
    expect(readPushState()).toBeNull()
    expect(mocks.deleteToken).toHaveBeenCalled()
  })

  it('a logout while the device is posted: unregistered after it (last), nothing stored', async () => {
    mocks.getToken.mockResolvedValue('new-token')
    const posted = deferred<unknown>()
    mocks.bffFetch.mockImplementationOnce(() => posted.promise)
    const enabling = subscribe(FIREBASE, OWNER)
    await vi.waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
    clearPushState()
    posted.resolve({ data: {}, msg: '', status: 201 })
    await expect(enabling).rejects.toBeInstanceOf(PushAbandoned)
    expect(devices().at(-1)).toBe('DELETE devices/unregister/ {"registration_id":"new-token"}')
    expect(readPushState()).toBeNull()
  })

  it('settlePushWork waits for it (a logout does not overtake it)', async () => {
    const token = deferred<string>()
    mocks.getToken.mockReturnValue(token.promise)
    const enabling = subscribe(FIREBASE, OWNER)
    let settled = false
    const waiting = settlePushWork().then(() => (settled = true))
    await vi.waitFor(() => expect(mocks.getToken).toHaveBeenCalled())
    expect(settled).toBe(false)
    token.resolve('new-token')
    await enabling
    await waiting
    expect(settled).toBe(true)
  })
})
