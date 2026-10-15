// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import { calls, envelope, failure, stubEnv, type FetchSpy } from '../bff/support'
import { loadApi, page, serve, type Next } from './support'

let fetchSpy: FetchSpy
let errorSpy: MockInstance<typeof console.error>

const reject = () => Promise.reject(new TypeError('fetch failed'))

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

describe('loaders never throw', () => {
  it('fall back when fetch rejects, logging once per loader and no secrets', async () => {
    fetchSpy.mockImplementation(reject)
    const api = await loadApi()
    expect(await api.getSiteSettings()).toBeNull()
    expect(await api.getMenu('main')).toEqual([])
    const features = await api.getFeatureStatus()
    expect(Object.keys(features).sort()).toEqual([...FEATURE_KEYS].sort())
    expect(Object.values(features).every((f) => f.enabled && f.reason === null)).toBe(true)
    expect(await api.getSocials()).toEqual([])
    expect(await api.getSnippets()).toEqual([])
    expect(await api.getTranslations()).toEqual({})
    expect(await api.getCategoryTree()).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(7)
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain('key-123')
  })

  it('fall back on an HTML error page or a non-object payload', async () => {
    fetchSpy.mockImplementation(async () => new Response('<html>502</html>', { status: 502 }))
    const api = await loadApi()
    expect(await api.getSiteSettings()).toBeNull()
    expect(await api.getMenu('footer')).toEqual([])
    fetchSpy.mockImplementation(async () => envelope(['not', 'an', 'object']))
    expect(await (await loadApi()).getSiteSettings()).toBeNull()
  })
})

describe('getSiteSettings', () => {
  it('returns the settings, cached 300 s under the settings tag', async () => {
    const settings = { name: 'فایرفلای', logo: null, auth: { google_login_enabled: false } }
    fetchSpy.mockImplementation(async () => envelope(settings))
    const { getSiteSettings } = await loadApi()
    expect(await getSiteSettings()).toEqual(settings)
    const [call] = calls(fetchSpy)
    expect(call?.url).toBe('https://api.test/api/v1/global/settings/')
    expect((call?.init as { next?: Next }).next).toEqual({ revalidate: 300, tags: ['settings'] })
    expect(call?.headers.has('X-Forwarded-For')).toBe(false)
  })
})

describe('getSiteSettings auth block', () => {
  const disabled = {
    google_login_enabled: false,
    google_client_id: null,
    sms_otp_enabled: false,
    telegram_otp_enabled: false,
    available_otp_methods: [],
    registration_methods: [],
    default_otp_methods: { email: 'email' },
  }

  it.each([
    ['missing', undefined],
    ['null', null],
    ['a string', 'x'],
    ['an array', []],
  ])('defaults to everything off when auth is %s', async (_label, auth) => {
    fetchSpy.mockImplementation(async () => envelope({ name: 'فروشگاه', auth }))
    const settings = await (await loadApi()).getSiteSettings()
    expect(settings).toMatchObject({ name: 'فروشگاه', auth: disabled })
  })

  it('keeps a real auth block as it is and hands out a fresh default each time', async () => {
    const auth = { ...disabled, google_login_enabled: true, google_client_id: 'id' }
    fetchSpy.mockImplementation(async () => envelope({ name: 'x', auth }))
    expect((await (await loadApi()).getSiteSettings())?.auth).toEqual(auth)
    fetchSpy.mockImplementation(async () => envelope({ name: 'x' }))
    const a = await (await loadApi()).getSiteSettings()
    const b = await (await loadApi()).getSiteSettings()
    expect(a?.auth).not.toBe(b?.auth)
  })
})

describe('getFeatureStatus', () => {
  const row = (feature_key: string, is_enabled: boolean, disable_reason: string | null = null) => ({
    feature_key,
    display_name: `نام ${feature_key}`,
    is_enabled,
    disable_reason,
  })

  it('maps the paginated rows and defaults a missing wallet to enabled', async () => {
    fetchSpy.mockImplementation(async () =>
      page([row('blog', true), row('coupons', false, 'در حال بروزرسانی'), row('mystery', false)]),
    )
    const { getFeatureStatus } = await loadApi()
    const features = await getFeatureStatus()
    expect(features.coupons).toEqual({
      key: 'coupons',
      name: 'نام coupons',
      enabled: false,
      reason: 'در حال بروزرسانی',
    })
    expect(features.blog).toMatchObject({ enabled: true, reason: null, name: 'نام blog' })
    expect(features.wallet.enabled).toBe(true)
    expect(features.wallet.reason).toBeNull()
    expect(features).not.toHaveProperty('mystery')
    const [call] = calls(fetchSpy)
    expect(call?.url).toBe('https://api.test/api/v1/global/feature-status/?limit=100&page=1')
    expect((call?.init as { next?: Next }).next).toEqual({ revalidate: 60, tags: ['features'] })
  })

  it('treats a blank reason as none and drops the reason of an enabled feature', async () => {
    fetchSpy.mockImplementation(async () =>
      page([row('wallet', false, '  '), row('blog', true, 'stale')]),
    )
    const features = await (await loadApi()).getFeatureStatus()
    expect(features.wallet).toMatchObject({ enabled: false, reason: null })
    expect(features.blog.reason).toBeNull()
  })

  it('treats anything but an explicit false as enabled', async () => {
    fetchSpy.mockImplementation(async () =>
      page([{ feature_key: 'wallet', display_name: 'x', is_enabled: 'no' }]),
    )
    expect((await (await loadApi()).getFeatureStatus()).wallet.enabled).toBe(true)
  })
})

describe('getMenu', () => {
  const node = (id: number, children: unknown[] = []) => ({
    id,
    title: `n${id}`,
    link_type: 'url',
    url: `/n${id}/`,
    target: null,
    open_in_new_tab: false,
    icon: null,
    children,
  })

  it('returns data.items, cached 300 s under menu:<key>', async () => {
    const items = [node(1, [node(2)]), node(3)]
    fetchSpy.mockImplementation(async () => envelope({ key: 'footer', title: 'فوتر', items }))
    const { getMenu } = await loadApi()
    expect(await getMenu('footer')).toEqual(items)
    const [call] = calls(fetchSpy)
    expect(call?.url).toBe('https://api.test/api/v1/menu/footer/')
    expect((call?.init as { next?: Next }).next).toEqual({ revalidate: 300, tags: ['menu:footer'] })
  })

  it('returns [] silently for menu_not_found and loudly for other failures', async () => {
    fetchSpy.mockImplementation(async () => failure(404, 'menu_not_found'))
    const { getMenu } = await loadApi()
    expect(await getMenu('header')).toEqual([])
    expect(errorSpy).not.toHaveBeenCalled()
    fetchSpy.mockImplementation(async () => failure(500, 'server_error'))
    expect(await getMenu('blog-sidebar')).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('repairs malformed nodes instead of letting the layout crash', async () => {
    fetchSpy.mockImplementation(async () =>
      envelope({ items: [{ ...node(1), children: undefined }, 'junk', null, { id: 2 }] }),
    )
    const items = await (await loadApi()).getMenu('main')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ id: 1, children: [] })
  })

  it('returns [] when items is missing', async () => {
    fetchSpy.mockImplementation(async () => envelope({ key: 'main' }))
    expect(await (await loadApi()).getMenu('main')).toEqual([])
  })
})

describe('paginated loaders', () => {
  const social = (id: number) => ({
    id,
    name: `s${id}`,
    username_or_id: `u${id}`,
    logo: null,
    link: `https://s/${id}`,
  })

  it('follow pages until next is null, with limit 100', async () => {
    serve(fetchSpy, {
      'global/socials/?limit=100&page=1': () => page([social(1), social(2)], 'http://api/x?page=2'),
      'global/socials/?limit=100&page=2': () => page([social(3)], null),
    })
    const { getSocials } = await loadApi()
    expect((await getSocials()).map((s) => s.id)).toEqual([1, 2, 3])
    const [first] = calls(fetchSpy)
    expect((first?.init as { next?: Next }).next).toEqual({ revalidate: 300, tags: ['socials'] })
  })

  it('fail with the fallback, logging once, when next never ends', async () => {
    fetchSpy.mockImplementation(async () => page([social(1)], 'http://api/x?page=99'))
    const { getSocials } = await loadApi()
    expect(await getSocials()).toEqual([])
    expect(fetchSpy).toHaveBeenCalledTimes(20)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    expect(errorSpy.mock.calls[0]?.join(' ')).toContain('global/socials has more than 20 pages')
  })

  it('return the fallback when a later page fails', async () => {
    serve(fetchSpy, {
      'global/socials/?limit=100&page=1': () => page([social(1)], 'http://api/x?page=2'),
    })
    expect(await (await loadApi()).getSocials()).toEqual([])
    expect(errorSpy).toHaveBeenCalledTimes(1)
  })

  it('getSocials drops rows without a link', async () => {
    fetchSpy.mockImplementation(async () => page([social(1), { id: 2, name: 'x' }, null]))
    expect((await (await loadApi()).getSocials()).map((s) => s.id)).toEqual([1])
  })

  it('getSnippets keeps API order and the raw snippet text', async () => {
    const rows = [
      { id: 2, description: 'd', position: 'bottom_of_body', type: 'script', snippet: '<b></b>' },
      { id: 1, description: 'd', position: 'in_head', type: 'meta', snippet: '<meta name="a">' },
      { id: 3, description: 'd', position: 'in_head', type: 'script' },
    ]
    fetchSpy.mockImplementation(async () => page(rows))
    const snippets = await (await loadApi()).getSnippets()
    expect(snippets.map((s) => s.id)).toEqual([2, 1])
    expect(snippets[1]?.snippet).toBe('<meta name="a">')
    const [call] = calls(fetchSpy)
    expect(call?.url).toBe('https://api.test/api/v1/global/extra-snippets/?limit=100&page=1')
    expect((call?.init as { next?: Next }).next).toEqual({ revalidate: 300, tags: ['snippets'] })
  })
})
