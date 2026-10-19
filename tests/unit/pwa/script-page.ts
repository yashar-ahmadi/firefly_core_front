import vm from 'node:vm'
import { vi } from 'vitest'
import { PHONE_QUERY, STANDALONE_QUERY } from '@/features/pwa/install-state'
import { REGISTER_SCRIPT } from '@/features/pwa/register-sw'

// A page for the registration script (src/features/pwa/register-sw.tsx), run with `node:vm`:
// its window, navigator, document, storages and media queries stand-ins, recorded.

export interface PageOptions {
  loaded?: boolean
  worker?: boolean
  storage?: boolean
  path?: string
  phone?: boolean
  standalone?: boolean
  /** Safari's own flag for a site opened from the home screen. */
  iosStandalone?: boolean
}

export function scriptPage({
  loaded = false,
  worker = true,
  storage = true,
  path = '/',
  phone = true,
  standalone = false,
  iosStandalone = false,
}: PageOptions = {}) {
  const listeners: Record<string, ((event: unknown) => void)[]> = {}
  const idle: (() => void)[] = []
  const store = (data: Map<string, string>) =>
    storage
      ? {
          getItem: (key: string) => data.get(key) ?? null,
          setItem: (key: string, value: string) => void data.set(key, value),
        }
      : {
          getItem: () => {
            throw new Error('SecurityError')
          },
          setItem: () => {
            throw new Error('SecurityError')
          },
        }
  const local = new Map<string, string>()
  const session = new Map<string, string>()
  const register = vi.fn(async () => ({}))
  const dispatched: string[] = []
  const window = {
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      (listeners[type] ??= []).push(listener),
    dispatchEvent: (event: { type: string }) => dispatched.push(event.type),
    requestIdleCallback: (callback: () => void) => idle.push(callback),
  } as Record<string, unknown>
  const matches = (query: string) =>
    (query === PHONE_QUERY && phone) || (query === STANDALONE_QUERY && standalone)
  const context = {
    window,
    navigator: {
      ...(worker ? { serviceWorker: { register } } : {}),
      ...(iosStandalone ? { standalone: true } : {}),
    },
    document: { readyState: loaded ? 'complete' : 'interactive' },
    location: { pathname: path },
    localStorage: store(local),
    sessionStorage: store(session),
    matchMedia: (query: string) => ({ matches: matches(query) }),
    Event: class {
      constructor(readonly type: string) {}
    },
    setTimeout,
  }
  /** One page load: the script runs as the page is parsed. */
  const run = () => vm.runInNewContext(REGISTER_SCRIPT, context)
  const fire = (type: string, event: unknown = {}) => listeners[type]?.forEach((l) => l(event))
  const idleNow = () => idle.splice(0).forEach((callback) => callback())
  /** A new tab session (sessionStorage is the tab's). */
  const newSession = () => session.clear()
  return { run, fire, idleNow, newSession, register, local, session, window, dispatched, listeners }
}
