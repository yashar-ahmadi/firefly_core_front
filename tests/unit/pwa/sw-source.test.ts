// @vitest-environment node
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { buildServiceWorker, REFRESH_MESSAGE } from '@/features/pwa/sw-source'

// `/sw.js` (the site's single worker): checked as text, then run in a stand-in worker scope (its
// `self`, clients and registration recorded) to see what each event does. It shows FCM's pushes
// itself (`{notification: {title, body, image}}`, no data, no link: digest §4.4) and a click
// brings up the inbox.

const SOURCE = buildServiceWorker({ inboxPath: '/account/notifications/', icon: '/favicon.ico' })
const ORIGIN = 'https://shop.test'
const INBOX = `${ORIGIN}/account/notifications/`

interface FakeClient {
  url: string
  focused: boolean
  /** Controlled by this worker (it can navigate it). */
  controlled: boolean
  postMessage: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  navigate: ReturnType<typeof vi.fn>
}

function windowAt(path: string, { focused = false, controlled = true } = {}): FakeClient {
  const client: FakeClient = {
    url: `${ORIGIN}${path}`,
    focused,
    controlled,
    postMessage: vi.fn(),
    focus: vi.fn(async () => client),
    navigate: vi.fn(async (url: string) => ({ ...client, url })),
  }
  return client
}

function worker(windows: FakeClient[] = []) {
  const handlers: Record<string, (event: unknown) => void> = {}
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      (handlers[type] = handler),
    skipWaiting: vi.fn(),
    location: { origin: ORIGIN },
    registration: { showNotification: vi.fn(async () => undefined) },
    clients: {
      claim: vi.fn(async () => undefined),
      openWindow: vi.fn(async () => null),
      matchAll: vi.fn(async ({ includeUncontrolled = false } = {}) =>
        includeUncontrolled ? windows : windows.filter((client) => client.controlled),
      ),
    },
  }
  vm.runInNewContext(SOURCE, { self, URL })
  const fire = async (type: string, fields: object = {}) => {
    const waits: Promise<unknown>[] = []
    handlers[type]!({ ...fields, waitUntil: (promise: Promise<unknown>) => waits.push(promise) })
    await Promise.all(waits)
  }
  return { self, fire }
}

const pushData = (payload: unknown) => ({
  data: {
    json: () => {
      if (payload instanceof Error) throw payload
      return payload
    },
  },
})

describe('the service worker source', () => {
  it('is one plain script with the lifecycle, push and click handlers, and no Firebase', () => {
    expect(() => new vm.Script(SOURCE)).not.toThrow()
    for (const handler of ['install', 'activate', 'push', 'notificationclick']) {
      expect(SOURCE).toContain(`self.addEventListener('${handler}'`)
    }
    expect(SOURCE).toContain('"/account/notifications/"')
    // Firebase's message shape (isFirebaseMessaging) only, never its SDK.
    expect(SOURCE).not.toMatch(/importScripts|firebasejs|firebase-messaging|gstatic/i)
  })

  it('takes over at once: skipWaiting on install, clients.claim on activate', async () => {
    const { self, fire } = worker()
    await fire('install')
    expect(self.skipWaiting).toHaveBeenCalledTimes(1)
    await fire('activate')
    expect(self.clients.claim).toHaveBeenCalledTimes(1)
  })
})

describe('a push', () => {
  const FCM = { notification: { title: 'جشنواره', body: 'تا ۴۰ درصد', image: 'https://x/i.png' } }

  it('shows FCM’s notification right to left, with the shop’s icon', async () => {
    const { self, fire } = worker()
    await fire('push', pushData({ ...FCM, from: '1234', fcmMessageId: 'abc' }))
    expect(self.registration.showNotification).toHaveBeenCalledExactlyOnceWith('جشنواره', {
      body: 'تا ۴۰ درصد',
      image: 'https://x/i.png',
      icon: '/favicon.ico',
      dir: 'rtl',
      lang: 'fa',
      tag: 'ff:جشنواره\nتا ۴۰ درصد',
    })
  })

  it('reads a bare {title, body} too, and shows something for a payload it cannot read', async () => {
    const { self, fire } = worker()
    await fire('push', pushData({ title: 'عنوان', body: 'متن' }))
    await fire('push', pushData(new SyntaxError('not JSON')))
    await fire('push', {})
    const shown = self.registration.showNotification.mock.calls as unknown as [string, object][]
    expect(shown.map(([title]) => title)).toEqual(['عنوان', 'اعلان تازه', 'اعلان تازه'])
    expect(shown[0]![1]).toMatchObject({ body: 'متن', image: undefined })
  })

  it('tells every open page (as Firebase’s onMessage reads it)', async () => {
    const page = windowAt('/product/x/')
    const { fire } = worker([page])
    await fire('push', pushData(FCM))
    expect(page.postMessage).toHaveBeenCalledExactlyOnceWith({
      isFirebaseMessaging: true,
      messageType: 'push-received',
      notification: { title: 'جشنواره', body: 'تا ۴۰ درصد', image: 'https://x/i.png' },
    })
  })

  it('the inbox in focus shows it itself (a toast): no system notification then', async () => {
    const inbox = windowAt('/account/notifications/', { focused: true })
    const { self, fire } = worker([inbox])
    await fire('push', pushData(FCM))
    expect(self.registration.showNotification).not.toHaveBeenCalled()
    expect(inbox.postMessage).toHaveBeenCalledTimes(1)
  })
})

describe('a click on a notification', () => {
  const click = () => ({ notification: { close: vi.fn() } })

  it('closes it and brings up the inbox window already open, which reads itself again', async () => {
    const other = windowAt('/')
    const inbox = windowAt('/account/notifications/')
    const { self, fire } = worker([other, inbox])
    const event = click()
    await fire('notificationclick', event)
    expect(event.notification.close).toHaveBeenCalled()
    expect(inbox.focus).toHaveBeenCalled()
    expect(inbox.postMessage).toHaveBeenCalledWith({ type: REFRESH_MESSAGE })
    expect(other.navigate).not.toHaveBeenCalled()
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('else focuses a window of the shop and takes it to the inbox', async () => {
    const page = windowAt('/product/x/')
    const { self, fire } = worker([page])
    await fire('notificationclick', click())
    expect(page.focus).toHaveBeenCalled()
    expect(page.navigate).toHaveBeenCalledWith(INBOX)
    expect(self.clients.openWindow).not.toHaveBeenCalled()
  })

  it('else (no window, or none it may navigate) opens the inbox in a new one', async () => {
    const stranger = windowAt('/', { controlled: false })
    const { self, fire } = worker([stranger])
    await fire('notificationclick', click())
    expect(stranger.navigate).not.toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledExactlyOnceWith(INBOX)
  })
})
