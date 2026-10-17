import type { FirebaseWebConfig } from '@/config/env-schema'

// The Firebase JS SDK (`firebase/app` + `firebase/messaging`), for web push only: never part of
// a page's own code. It is downloaded the first time push needs it (turning it on, the inbox
// while it is on, or the daily token check); a download that fails rejects, and the caller shows
// its own failure. Only the token is used: `/sw.js` shows the pushes itself.

/** A push as the page receives it while it is in view (`onMessage`). */
export interface ForegroundPush {
  title: string
  body: string
}

export interface Messaging {
  /** This browser's FCM token, through the given service worker registration's push manager. */
  getToken: (registration: ServiceWorkerRegistration) => Promise<string>
  /** Revokes the token (best effort: only once `getToken` has run on this page). */
  deleteToken: () => Promise<void>
  /** Pushes received while a page of the shop is in view; returns the unsubscribe. */
  onMessage: (listener: (push: ForegroundPush) => void) => () => void
}

let loading: Promise<Messaging> | null = null

async function create(config: FirebaseWebConfig): Promise<Messaging> {
  const [app, sdk] = await Promise.all([import('firebase/app'), import('firebase/messaging')])
  const { vapidKey, ...web } = config
  const firebase = app.getApps()[0] ?? app.initializeApp(web)
  const messaging = sdk.getMessaging(firebase)
  let tokenRead = false
  return {
    getToken: async (registration) => {
      const token = await sdk.getToken(messaging, {
        vapidKey,
        serviceWorkerRegistration: registration,
      })
      tokenRead = true
      return token
    },
    deleteToken: async () => {
      // Without a registration of its own, the SDK would register `/firebase-messaging-sw.js`.
      if (tokenRead) await sdk.deleteToken(messaging)
    },
    onMessage: (listener) =>
      sdk.onMessage(messaging, ({ notification }) =>
        listener({ title: notification?.title ?? '', body: notification?.body ?? '' }),
      ),
  }
}

/** The SDK, once per page; a failed download is tried again next time. */
export function loadMessaging(config: FirebaseWebConfig): Promise<Messaging> {
  loading ??= create(config).catch((error: unknown) => {
    loading = null
    throw error
  })
  return loading
}
