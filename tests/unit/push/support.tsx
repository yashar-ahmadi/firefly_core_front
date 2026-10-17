import type { ReactNode } from 'react'
import { vi } from 'vitest'
import type { FirebaseWebConfig } from '@/config/env-schema'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { StoreConfigProvider } from '@/lib/config-context'
import { clientProviders } from '../support/providers'

// What web push's tests share: a store config with or without Firebase, the providers, and a
// browser with the Notification API, a push manager and `navigator.serviceWorker`, each recorded.

export const FIREBASE: FirebaseWebConfig = {
  apiKey: 'api-key',
  projectId: 'shop-project',
  messagingSenderId: '1234',
  appId: '1:1234:web:abcd',
  vapidKey: 'vapid-public-key',
}

export function pushConfig(
  firebase: FirebaseWebConfig | null = FIREBASE,
  webPush = firebase !== null,
): PublicStoreConfig {
  return {
    features: { compare: true, quickView: true, recentlyViewed: true, pwa: true, webPush },
    firebase,
    mediaOrigin: 'http://localhost:8000',
  } as PublicStoreConfig
}

export function pushProviders({
  hasSession = true,
  firebase = FIREBASE,
  webPush,
}: { hasSession?: boolean; firebase?: FirebaseWebConfig | null; webPush?: boolean } = {}) {
  const base = clientProviders({ hasSession })
  const Base = base.wrapper
  const wrapper = ({ children }: { children: ReactNode }) => (
    <StoreConfigProvider value={pushConfig(firebase, webPush)}>
      <Base>{children}</Base>
    </StoreConfigProvider>
  )
  return { client: base.client, wrapper }
}

export interface PushBrowser {
  /** Every browser call, in order: `permission`, `register`, `unsubscribe`. */
  calls: string[]
  requestPermission: ReturnType<typeof vi.fn<() => Promise<NotificationPermission>>>
  register: ReturnType<typeof vi.fn>
  registration: ServiceWorkerRegistration
  /** Messages from the worker, as `navigator.serviceWorker` dispatches them. */
  postFromWorker: (data: unknown) => void
}

/**
 * A browser that can receive web push, its permission `permission` (granted on request unless
 * `answer` says otherwise). Undo with `unstubPushBrowser`.
 */
export function stubPushBrowser({
  permission = 'default',
  answer = 'granted',
}: { permission?: NotificationPermission; answer?: NotificationPermission } = {}): PushBrowser {
  const calls: string[] = []
  const notification = { permission }
  const requestPermission = vi.fn(async () => {
    calls.push('permission')
    notification.permission = answer
    return answer
  })
  vi.stubGlobal('Notification', {
    get permission() {
      return notification.permission
    },
    requestPermission,
  })
  vi.stubGlobal('PushManager', function PushManager() {})
  const subscription = {
    unsubscribe: vi.fn(async () => {
      calls.push('unsubscribe')
      return true
    }),
  }
  const registration = {
    active: {},
    scope: 'http://localhost:3000/',
    pushManager: { getSubscription: async () => subscription },
  } as unknown as ServiceWorkerRegistration
  const register = vi.fn(async () => {
    calls.push('register')
    return registration
  })
  const target = new EventTarget()
  Object.defineProperty(navigator, 'serviceWorker', {
    configurable: true,
    value: Object.assign(target, {
      register,
      ready: Promise.resolve(registration),
      getRegistration: vi.fn(async () => registration),
    }),
  })
  return {
    calls,
    requestPermission,
    register,
    registration,
    postFromWorker: (data) => target.dispatchEvent(new MessageEvent('message', { data })),
  }
}

export function unstubPushBrowser(): void {
  vi.unstubAllGlobals()
  Reflect.deleteProperty(navigator, 'serviceWorker')
}
