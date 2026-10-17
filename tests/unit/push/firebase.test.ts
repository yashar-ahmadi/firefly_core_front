import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FIREBASE } from './support'

// The Firebase SDK loads only through `loadMessaging` (dynamic imports): a download that fails
// rejects (the caller shows its failure) and is tried again next time; the token is asked with
// the shop's VAPID key and the site worker's registration, never Firebase's own worker.

const sdk = vi.hoisted(() => ({
  initializeApp: vi.fn((options: object) => ({ name: '[DEFAULT]', options })),
  getApps: vi.fn((): object[] => []),
  getMessaging: vi.fn(() => ({ messaging: true })),
  getToken: vi.fn(async () => 'token'),
  deleteToken: vi.fn(async () => true),
  onMessage: vi.fn(() => () => {}),
  fail: false,
}))
vi.mock('firebase/app', () => ({ initializeApp: sdk.initializeApp, getApps: sdk.getApps }))
vi.mock('firebase/messaging', () => {
  if (sdk.fail) throw new Error('Failed to fetch dynamically imported module')
  return {
    getMessaging: sdk.getMessaging,
    getToken: sdk.getToken,
    deleteToken: sdk.deleteToken,
    onMessage: sdk.onMessage,
  }
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.resetModules()
  sdk.fail = false
})

afterEach(() => {
  vi.resetModules()
})

const load = async () => (await import('@/features/push/firebase')).loadMessaging

describe('loadMessaging', () => {
  it('a download that fails rejects, and the next call tries again', async () => {
    sdk.fail = true
    const loadMessaging = await load()
    await expect(loadMessaging(FIREBASE)).rejects.toThrow()
    sdk.fail = false
    vi.resetModules()
    await expect(loadMessaging(FIREBASE)).resolves.toBeDefined()
  })

  it('starts the app with the web config (the VAPID key goes to the token only)', async () => {
    const messaging = await (await load())(FIREBASE)
    const { vapidKey, ...web } = FIREBASE
    expect(sdk.initializeApp).toHaveBeenCalledWith(web)
    const registration = { scope: '/' } as ServiceWorkerRegistration
    await expect(messaging.getToken(registration)).resolves.toBe('token')
    expect(sdk.getToken).toHaveBeenCalledWith(
      { messaging: true },
      { vapidKey, serviceWorkerRegistration: registration },
    )
  })

  it('revokes the token only once it was read on this page (else the SDK registers its own worker)', async () => {
    const messaging = await (await load())(FIREBASE)
    await messaging.deleteToken()
    expect(sdk.deleteToken).not.toHaveBeenCalled()
    await messaging.getToken({} as ServiceWorkerRegistration)
    await messaging.deleteToken()
    expect(sdk.deleteToken).toHaveBeenCalledTimes(1)
  })

  it('hands on a push received in view as its title and text', async () => {
    const messaging = await (await load())(FIREBASE)
    const listener = vi.fn()
    messaging.onMessage(listener)
    const [, forward] = sdk.onMessage.mock.calls[0] as unknown as [
      unknown,
      (payload: object) => void,
    ]
    forward({ notification: { title: 'عنوان', body: 'متن' } })
    forward({})
    expect(listener.mock.calls).toEqual([
      [{ title: 'عنوان', body: 'متن' }],
      [{ title: '', body: '' }],
    ])
  })
})
