// The source of the site's single service worker, `/sw.js` (src/app/sw.js/route.ts), scope `/`.
// Built from sections, each a block of plain browser JavaScript run in the worker: Plan 5 adds
// offline caching as one more section. No Firebase in the worker: Firebase's own messaging
// worker is not needed, because the page gets its token through this worker's registration and
// the pushes (FCM's `notification` block only: no data, no link, digest §4.4) are shown here.
// Pure; the strings are tested as text and run against a stand-in worker scope.

export interface ServiceWorkerOptions {
  /** Where a notification click goes (the inbox). */
  inboxPath: string
  /** The notification's small icon: a same-origin path. */
  icon: string
}

/** The message pages receive after a click: the inbox reads itself again. */
export const REFRESH_MESSAGE = 'ff:notifications-refresh'

/** What the sections share: the options, and the shop's open windows. */
function sharedSection({ inboxPath, icon }: ServiceWorkerOptions): string {
  return `
const INBOX_PATH = ${JSON.stringify(inboxPath)}
const ICON = ${JSON.stringify(icon)}
const REFRESH_MESSAGE = ${JSON.stringify(REFRESH_MESSAGE)}

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true })
const onInbox = (client) => new URL(client.url).pathname === INBOX_PATH`
}

/** Takes over at once on install and update, and controls the open pages. */
function lifecycleSection(): string {
  return `
self.addEventListener('install', () => {
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim())
})`
}

/**
 * A push: FCM puts the message under \`notification\` (a raw \`{title, body}\` is read too). Open
 * pages hear of it in the shape Firebase's window SDK reads, so \`onMessage\` fires where Firebase
 * is loaded (the inbox, which then shows a toast). The system notification is shown unless the
 * inbox itself has the focus; never matched to a row (the push carries no id).
 */
function pushSection(): string {
  return `
const FALLBACK_TITLE = 'اعلان تازه'

function readPush(data) {
  let payload = null
  try {
    payload = data ? data.json() : null
  } catch (error) {
    payload = null
  }
  const source = payload && typeof payload === 'object' ? payload.notification || payload : {}
  const text = (value) => (typeof value === 'string' ? value : '')
  return {
    title: text(source.title) || FALLBACK_TITLE,
    body: text(source.body),
    image: text(source.image) || undefined,
  }
}

self.addEventListener('push', (event) => {
  const message = readPush(event.data)
  event.waitUntil(
    windows().then((clients) => {
      for (const client of clients) {
        client.postMessage({ isFirebaseMessaging: true, messageType: 'push-received', notification: message })
      }
      if (clients.some((client) => client.focused && onInbox(client))) return undefined
      return self.registration.showNotification(message.title, {
        body: message.body,
        image: message.image,
        icon: ICON,
        dir: 'rtl',
        lang: 'fa',
        tag: 'ff:' + message.title + '\\n' + message.body,
      })
    }),
  )
})`
}

/**
 * A click on a notification: it closes, and the inbox comes up: the window already on it is
 * focused and told to read the inbox again; else the inbox opens in a new window. A window on
 * another page is never taken there: it may be busy (a checkout, a form being filled).
 */
function clickSection(): string {
  return `
async function showInbox() {
  const onIt = (await windows()).find(onInbox)
  if (onIt) {
    await onIt.focus()
    onIt.postMessage({ type: REFRESH_MESSAGE })
    return
  }
  try {
    await self.clients.openWindow(new URL(INBOX_PATH, self.location.origin).href)
  } catch (error) {
    // Not allowed here (the browser decides): the notification is gone, nothing more to do.
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(showInbox())
})`
}

/** The whole worker script. */
export function buildServiceWorker(options: ServiceWorkerOptions): string {
  return [
    `'use strict'\n// Firefly storefront service worker (built by src/features/pwa/sw-source.ts).`,
    sharedSection(options),
    lifecycleSection(),
    pushSection(),
    clickSection(),
  ].join('\n')
}
