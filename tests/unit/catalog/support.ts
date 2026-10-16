import { afterEach, beforeEach, vi, type MockInstance } from 'vitest'
import { stubEnv, type Call, type FetchSpy } from '../bff/support'
import type { Next } from '../settings/support'

export const API = 'https://api.test/api/v1/'
/** «گوشی» and its UTF-8 percent-encoding. */
export const GOOSHI = 'گوشی'
export const GOOSHI_ENCODED = '%DA%AF%D9%88%D8%B4%DB%8C'

/** The incoming request's headers that `next/headers` hands the loaders (`x-real-ip` by default). */
export const requestHeaders: Record<string, string> = {}

/** Fresh module graph per test so the memoized env picks up the stubs. */
export async function loadCatalog() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  vi.doMock('next/headers', () => ({ headers: async () => new Headers(requestHeaders) }))
  return import('@/features/catalog/api')
}

/** The Next.js Data Cache options a fetch call was made with. */
export const nextOf = (call: Call | undefined) => (call?.init as { next?: Next }).next

export interface CatalogMocks {
  fetch: FetchSpy
  error: MockInstance<typeof console.error>
  warn: MockInstance<typeof console.warn>
}

/** Stub the env, spy on fetch and silence console errors and warnings around every test. */
export function mockCatalogApi(): CatalogMocks {
  const mocks = {} as CatalogMocks
  beforeEach(() => {
    stubEnv()
    for (const key of Object.keys(requestHeaders)) delete requestHeaders[key]
    requestHeaders['x-real-ip'] = '198.51.100.7'
    mocks.fetch = vi.spyOn(globalThis, 'fetch')
    mocks.error = vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
    vi.resetModules()
    vi.doUnmock('server-only')
    vi.doUnmock('next/headers')
  })
  return mocks
}
