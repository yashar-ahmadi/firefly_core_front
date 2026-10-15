// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { calls, envelope, failure, stubEnv, type FetchSpy } from '../bff/support'
import { loadApi, serve, type Next } from './support'

let fetchSpy: FetchSpy
let errorSpy: MockInstance<typeof console.error>

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
  errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('getTranslations', () => {
  const fa = { language_code: 'fa', is_rtl: true, translation: { currency: 'تومان', n: 5, o: {} } }

  it('reads the singular translation key of get-translation/fa/, strings only', async () => {
    fetchSpy.mockImplementation(async () => envelope(fa))
    const { getTranslations } = await loadApi()
    expect(await getTranslations()).toEqual({ currency: 'تومان' })
    const [call] = calls(fetchSpy)
    expect(call?.url).toBe('https://api.test/api/v1/global/get-translation/fa/')
    expect((call?.init as { next?: Next }).next).toEqual({
      revalidate: 300,
      tags: ['translations'],
    })
  })

  it('also accepts a plural translations key, and null means nothing to merge', async () => {
    fetchSpy.mockImplementation(async () => envelope({ translations: { cart: 'سبد' } }))
    expect(await (await loadApi()).getTranslations()).toEqual({ cart: 'سبد' })
    fetchSpy.mockImplementation(async () => envelope({ language_code: 'fa', translation: null }))
    expect(await (await loadApi()).getTranslations()).toEqual({})
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('falls back to the fa entry of languages/?platform=web', async () => {
    serve(fetchSpy, {
      'global/languages/?platform=web': () =>
        envelope({
          default_language: 'fa',
          enabled_languages: [
            { language_code: 'en', translations: { cart: 'Cart' } },
            { language_code: 'fa', translations: { cart: 'سبد من' } },
          ],
        }),
    })
    expect(await (await loadApi()).getTranslations()).toEqual({ cart: 'سبد من' })
    expect(errorSpy).not.toHaveBeenCalled()
  })

  it('returns {} and logs once when both endpoints fail', async () => {
    fetchSpy.mockImplementation(async () => failure(500, 'server_error'))
    expect(await (await loadApi()).getTranslations()).toEqual({})
    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('returns {} when languages has no fa entry', async () => {
    serve(fetchSpy, {
      'global/languages/?platform=web': () =>
        envelope({ enabled_languages: [{ language_code: 'en', translations: { a: 'b' } }] }),
    })
    expect(await (await loadApi()).getTranslations()).toEqual({})
  })

  it('keeps an own "__proto__" key harmlessly', async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response('{"msg":"m","code":200,"data":{"translation":{"__proto__":"x","a":"b"}}}', {
          headers: { 'content-type': 'application/json' },
        }),
    )
    const dict = await (await loadApi()).getTranslations()
    expect(Object.getPrototypeOf(dict)).toBe(Object.prototype)
    expect(dict.a).toBe('b')
  })
})
