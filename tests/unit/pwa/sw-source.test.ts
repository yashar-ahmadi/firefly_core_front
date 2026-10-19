// @vitest-environment node
import vm from 'node:vm'
import { describe, expect, it, vi } from 'vitest'
import { OFFLINE_COPY_HEADER, OFFLINE_PAGES, SW_NEVER_CACHED } from '@/features/pwa/offline-rules'
import {
  buildServiceWorker,
  REFRESH_MESSAGE,
  serviceWorkerSections,
} from '@/features/pwa/sw-source'
import { ORIGIN, windowAt, worker as standIn, type FakeClient } from './sw-scope'

// `/sw.js` (the site's single worker): checked as text, then run in a stand-in worker scope (its
// `self`, clients and registration recorded) to see what each event does. It shows FCM's pushes
// itself (`{notification: {title, body, image}}`, no data, no link: digest §4.4) and a click
// brings up the inbox, the same with offline caching on (FEATURE_PWA, Plan 5 Task 6) or off.

const OPTIONS = { inboxPath: '/account/notifications/', icon: '/favicon.ico', version: 'build-x' }
const PUSH_ONLY = buildServiceWorker({ ...OPTIONS, offline: false })
const WITH_OFFLINE = buildServiceWorker({ ...OPTIONS, offline: true })
const INBOX = `${ORIGIN}/account/notifications/`

const BUILDS = [
  ['offline caching off', PUSH_ONLY],
  ['offline caching on', WITH_OFFLINE],
] as const

const pushData = (payload: unknown) => ({
  data: {
    json: () => {
      if (payload instanceof Error) throw payload
      return payload
    },
  },
})

describe('the service worker source', () => {
  it.each(BUILDS)(
    '%s: one plain script with the lifecycle, push and click handlers, and no Firebase',
    (_, source) => {
      expect(() => new vm.Script(source)).not.toThrow()
      for (const handler of ['install', 'activate', 'push', 'notificationclick']) {
        expect(source).toContain(`self.addEventListener('${handler}'`)
      }
      expect(source).toContain('"/account/notifications/"')
      // Firebase's message shape (isFirebaseMessaging) only, never its SDK.
      expect(source).not.toMatch(/importScripts|firebasejs|firebase-messaging|gstatic/i)
    },
  )

  it('with offline caching, every path never cached is in its bypass list (the brief’s test)', () => {
    const bypass = /const NEVER_CACHED = (\[.*\])\n/.exec(WITH_OFFLINE)?.[1]
    expect(JSON.parse(bypass ?? 'null')).toEqual([...SW_NEVER_CACHED])
    for (const path of [
      '/api/',
      '/account/',
      '/cart/',
      '/checkout/',
      '/payment/',
      '/order/',
      '/login/',
      '/register/',
      '/forgot-password/',
      '/s/',
      '/sw.js',
      '/manifest.webmanifest',
      '/healthz/',
    ]) {
      expect(SW_NEVER_CACHED, path).toContain(path)
      expect(WITH_OFFLINE, path).toContain(JSON.stringify(path))
    }
    expect(WITH_OFFLINE).toContain(JSON.stringify(OFFLINE_PAGES))
    expect(WITH_OFFLINE).toContain(JSON.stringify(OFFLINE_COPY_HEADER))
    expect(WITH_OFFLINE).toContain('"build-x"')
  })

  it('caching is a section of its own: the push and click sections are the same text', () => {
    // The header, what the sections share, the lifecycle, the push and the click: identical.
    const off = serviceWorkerSections({ ...OPTIONS, offline: false })
    const on = serviceWorkerSections({ ...OPTIONS, offline: true })
    expect(on.slice(0, 5)).toEqual(off.slice(0, 5))
    expect(on.slice(5)).not.toEqual(off.slice(5))
    expect(WITH_OFFLINE).toBe(on.join('\n'))
    // Off, the worker answers no request (it only shows pushes): no fetch handler at all.
    expect(PUSH_ONLY).not.toContain("addEventListener('fetch'")
    expect(WITH_OFFLINE).toContain("addEventListener('fetch'")
  })

  it.each(BUILDS)(
    '%s: takes over at once: skipWaiting on install, clients.claim on activate',
    async (_, source) => {
      const { self, fire } = standIn(source)
      await fire('install')
      expect(self.skipWaiting).toHaveBeenCalledTimes(1)
      await fire('activate')
      expect(self.clients.claim).toHaveBeenCalledTimes(1)
    },
  )
})

describe.each(BUILDS)('a push (%s)', (_, source) => {
  const worker = (windows: FakeClient[] = []) => standIn(source, { windows })
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

describe.each(BUILDS)('a click on a notification (%s)', (_, source) => {
  const worker = (windows: FakeClient[] = []) => standIn(source, { windows })
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

  it.each([
    ['a window of the shop busy elsewhere (checkout)', windowAt('/checkout/', { focused: true })],
    ['a window the worker does not control', windowAt('/', { controlled: false })],
  ])('else opens the inbox in a new window: %s is never taken away', async (_, page) => {
    const { self, fire } = worker([page])
    await fire('notificationclick', click())
    expect(page.navigate).not.toHaveBeenCalled()
    expect(page.focus).not.toHaveBeenCalled()
    expect(self.clients.openWindow).toHaveBeenCalledExactlyOnceWith(INBOX)
  })

  it('no window at all: opens the inbox; a window that cannot be opened is no error', async () => {
    const { self, fire } = worker([])
    self.clients.openWindow.mockRejectedValueOnce(new TypeError('not allowed'))
    await expect(fire('notificationclick', click())).resolves.toBeUndefined()
    expect(self.clients.openWindow).toHaveBeenCalledExactlyOnceWith(INBOX)
  })
})
