import { describe, expect, it, vi } from 'vitest'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig } from '@/config/resolve-store-config'
import { buildManifest, shortName } from '@/features/pwa/manifest'
import type { SiteSettings } from '@/lib/api/types/settings'

// `/manifest.webmanifest` (src/app/manifest.ts), built at request time from the settings and the
// store config (R5: nothing from the API at build time): the shop's name, Persian and right to
// left, its brand colour, the app's start page (`/?source=pwa`, whose canonical stays `/`), the
// icons of src/app/icons/[size] and the three shortcuts.

const mocks = vi.hoisted(() => ({ settings: null as unknown }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => mocks.settings }))
vi.mock('@/config/store-config', async () => {
  const { parseServerEnv: parse } = await import('@/config/env-schema')
  const { resolveStoreConfig: resolve } = await import('@/config/resolve-store-config')
  const env = parse({ FIREFLY_API_URL: 'https://api.shop.ir', SITE_URL: 'https://shop.ir' })
  return { getStoreConfig: () => resolve(env) }
})

const config = (extra: Record<string, string> = {}) =>
  resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir',
      SITE_URL: 'https://shop.ir',
      ...extra,
    }),
  )

const settings = (fields: Partial<SiteSettings>) => fields as SiteSettings

describe('buildManifest', () => {
  it('the shop’s name, Persian and right to left, standalone from /?source=pwa, its colours', () => {
    const manifest = buildManifest(
      config({ THEME_PRIMARY: '#0E7490' }),
      settings({ name: 'فایرفلای', slogan: 'خرید مطمئن، ارسال سریع' }),
    )
    expect(manifest).toMatchObject({
      id: '/',
      name: 'فایرفلای',
      short_name: 'فایرفلای',
      description: 'خرید مطمئن، ارسال سریع',
      lang: 'fa',
      dir: 'rtl',
      start_url: '/?source=pwa',
      scope: '/',
      display: 'standalone',
      theme_color: '#0E7490',
      background_color: '#ffffff',
    })
  })

  it('icons at 192 and 512, the 512 also maskable (src/app/icons/[size])', () => {
    expect(buildManifest(config(), null).icons).toEqual([
      { src: '/icons/192/', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/512/', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/512/', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ])
  })

  it('shortcuts: search, the cart, my orders', () => {
    expect(buildManifest(config(), null).shortcuts).toEqual([
      { name: 'جستجو', url: '/search/' },
      { name: 'سبد خرید', url: '/cart/' },
      { name: 'سفارش‌های من', short_name: 'سفارش‌ها', url: '/account/orders/' },
    ])
  })

  it('without settings: the preset’s label, its colour, and no description key', () => {
    const manifest = buildManifest(config({ STORE_PRESET: 'carpet' }), null)
    expect(manifest.name).toBe('فرش')
    expect(manifest.theme_color).toBe('#8B1E3F')
    expect('description' in manifest).toBe(false)
    expect(Object.values(manifest)).not.toContain(undefined)
  })

  it('a blank name or slogan counts as none', () => {
    const manifest = buildManifest(config(), settings({ name: '  ', slogan: ' ' }))
    expect(manifest.name).toBe('فروشگاه')
    expect('description' in manifest).toBe(false)
  })
})

describe('shortName', () => {
  it.each([
    ['فایرفلای', 'فایرفلای'],
    ['گل‌فروشی رز', 'گل‌فروشی رز'],
    // Longer than a launcher shows: the last word, where the brand usually is.
    ['فروشگاه اینترنتی فایرفلای', 'فایرفلای'],
    // No word to keep: too short to name the shop, or none short enough: the name as it is
    // (the launcher shortens it).
    ['کتاب‌فروشی من', 'کتاب‌فروشی من'],
    ['فروشگاه‌اینترنتی‌بزرگ‌فایرفلای', 'فروشگاه‌اینترنتی‌بزرگ‌فایرفلای'],
  ])('%s → %s', (name, short) => {
    expect(shortName(name)).toBe(short)
  })
})

describe('/manifest.webmanifest', () => {
  it('is built at request time from the settings and the store config', async () => {
    const route = await import('@/app/manifest')
    expect(route.dynamic).toBe('force-dynamic')
    mocks.settings = { name: 'فایرفلای', slogan: null }
    expect(await route.default()).toEqual(
      buildManifest(config(), settings({ name: 'فایرفلای', slogan: null })),
    )
  })
})
