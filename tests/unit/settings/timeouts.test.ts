// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { envelope, stubEnv, type FetchSpy } from '../bff/support'
import { loadApi, page, serve } from './support'

// The shell loaders run before the first byte of every page: with a cold cache and a hanging
// backend each one gives up after 3.5 s (the transport default of 10 s is for other calls).

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('shell loader timeouts', () => {
  it('gives every shell request 3.5 s, the translation fallback included', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    serve(fetchSpy, {
      'global/settings/': () => envelope({ name: 'x', auth: {} }),
      'global/feature-status/?limit=100&page=1': () => page([]),
      'menu/main/': () => envelope({ items: [] }),
      'global/socials/?limit=100&page=1': () => page([]),
      'global/extra-snippets/?limit=100&page=1': () => page([]),
      // get-translation/fa/ fails (500), so languages/ is asked too.
      'global/languages/?platform=web': () => envelope({ enabled_languages: [] }),
      'product/category/list/?limit=100&page=1': () => page([]),
    })
    const api = await loadApi()
    await Promise.all([
      api.getSiteSettings(),
      api.getFeatureStatus(),
      api.getMenu('main'),
      api.getSocials(),
      api.getSnippets(),
      api.getTranslations(),
      api.getCategoryTree(),
    ])
    expect(fetchSpy).toHaveBeenCalledTimes(8)
    expect(timeout.mock.calls).toEqual(Array.from({ length: 8 }, () => [3_500]))
  })
})
