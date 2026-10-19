import vm from 'node:vm'
import { vi } from 'vitest'

// A stand-in service worker scope for `/sw.js` (src/features/pwa/sw-source.ts): the script runs in
// a fresh `node:vm` context with a recorded `self` (clients, registration, skipWaiting), an
// in-memory CacheStorage and a scripted `fetch`, so each event's effect can be read back.

export const ORIGIN = 'https://shop.test'

export interface FakeClient {
  url: string
  focused: boolean
  /** Controlled by this worker (it can navigate it). */
  controlled: boolean
  postMessage: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
  navigate: ReturnType<typeof vi.fn>
}

export function windowAt(path: string, { focused = false, controlled = true } = {}): FakeClient {
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

type Key = string | Request

const keyOf = (request: Key) =>
  typeof request === 'string' ? new URL(request, ORIGIN).href : request.url

/** One cache: entries in the order they were stored (as the Cache API keeps them). */
export class FakeCache {
  readonly entries = new Map<string, Response>()
  async match(request: Key) {
    return this.entries.get(keyOf(request))?.clone()
  }
  async put(request: Key, response: Response) {
    const key = keyOf(request)
    this.entries.delete(key)
    this.entries.set(key, response)
  }
  async delete(request: Key) {
    return this.entries.delete(keyOf(request))
  }
  async keys() {
    return [...this.entries.keys()].map((url) => new Request(url))
  }
  /** The stored paths, oldest first. */
  paths() {
    return [...this.entries.keys()].map((url) => url.replace(ORIGIN, ''))
  }
}

export class FakeCacheStorage {
  readonly stores = new Map<string, FakeCache>()
  async open(name: string) {
    if (!this.stores.has(name)) this.stores.set(name, new FakeCache())
    return this.stores.get(name)!
  }
  async keys() {
    return [...this.stores.keys()]
  }
  async delete(name: string) {
    return this.stores.delete(name)
  }
  async has(name: string) {
    return this.stores.has(name)
  }
  async match(request: Key, options: { cacheName?: string } = {}) {
    const names = options.cacheName ? [options.cacheName] : [...this.stores.keys()]
    for (const name of names) {
      const found = await this.stores.get(name)?.match(request)
      if (found) return found
    }
    return undefined
  }
}

export interface Served {
  status?: number
  headers?: Record<string, string>
  /** The response's type as the worker sees it (`basic` for the shop's own). */
  type?: ResponseType
}

/** A response the network gives the worker. */
export function served(body: string, { status = 200, headers = {}, type = 'basic' }: Served = {}) {
  const response = new Response(body, { status, headers })
  Object.defineProperty(response, 'type', { value: type })
  return response
}

export type Network = (request: Request) => Response | Promise<Response>

/** The page as browsers send a navigation to it. */
export function navigation(path: string, init: RequestInit = {}) {
  const request = new Request(`${ORIGIN}${path}`, init)
  Object.defineProperty(request, 'mode', { value: 'navigate' })
  return request
}

/** A subresource request (`destination`: what the page asks it for). */
export function subresource(path: string, destination: RequestDestination = '', init = {}) {
  const request = new Request(path.startsWith('http') ? path : `${ORIGIN}${path}`, init)
  Object.defineProperty(request, 'destination', { value: destination })
  return request
}

export function worker(
  source: string,
  {
    windows = [] as FakeClient[],
    network = (() => {
      throw new TypeError('Failed to fetch')
    }) as Network,
  } = {},
) {
  const handlers: Record<string, ((event: unknown) => void)[]> = {}
  const caches = new FakeCacheStorage()
  const requests: Request[] = []
  const fetch = vi.fn(async (input: RequestInfo, init?: RequestInit) => {
    const request = new Request(typeof input === 'string' ? new URL(input, ORIGIN) : input, init)
    requests.push(request)
    return network(request)
  })
  const self = {
    addEventListener: (type: string, handler: (event: unknown) => void) =>
      (handlers[type] ??= []).push(handler),
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
  vm.runInNewContext(source, {
    self,
    caches,
    fetch,
    URL,
    Request,
    Response,
    Headers,
    // Read when called: a test's fake timers apply.
    setTimeout: (...args: Parameters<typeof setTimeout>) => setTimeout(...args),
    clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
  })

  /**
   * Fires `type` at every listener, synchronously as browsers do: `answer` is what was given to
   * `respondWith` (null when nothing was), `settled` every `waitUntil` (for tests on timers).
   */
  const dispatch = (
    type: string,
    fields: object = {},
  ): { answer: Promise<Response> | null; settled: () => Promise<void> } => {
    const waits: Promise<unknown>[] = []
    // Widened on purpose: TypeScript cannot see the listeners assign it.
    let answer = null as Promise<Response> | null
    const event = {
      ...fields,
      waitUntil: (promise: Promise<unknown>) => waits.push(promise),
      respondWith: (response: Response | Promise<Response>) => (answer = Promise.resolve(response)),
    }
    for (const handler of handlers[type] ?? []) handler(event)
    return { answer, settled: () => Promise.all(waits).then(() => undefined) }
  }
  /** Fires `type`; resolves to the answer (if any) once every `waitUntil` has settled. */
  const fire = async (type: string, fields: object = {}): Promise<Response | undefined> => {
    const { answer, settled } = dispatch(type, fields)
    const response = answer ? await answer : undefined
    await settled()
    return response
  }
  /** A fetch event for `request`: the worker's answer, or undefined when it lets it be. */
  const request = (req: Request) => fire('fetch', { request: req })
  return { self, dispatch, fire, request, caches, fetch, requests }
}
