import { describe, expect, it, vi } from 'vitest'
import { generateMetadata } from '@/app/(shop)/categories/page'

// `/categories/` (the phone's categories tab, the category tree's browser): indexable, so it has
// its canonical and the social cards like every indexable page (Plan 5 Task 7's audit: it had
// only a title).

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
  getCategoryTree: async () => [],
  getMenu: async () => [],
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = () =>
    pure.resolveStoreConfig(
      parseServerEnv({
        FIREFLY_API_URL: 'https://api.shop.ir/',
        SITE_URL: 'https://shop.ir/',
        FIREFLY_API_KEY: 'k',
      }),
    )
  return { ...pure, getStoreConfig: config }
})

describe('the categories page’s head', () => {
  it('its title, its own canonical, the social cards; indexable', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('دسته\u{200C}بندی\u{200C}ها')
    expect(meta.alternates).toEqual({ canonical: '/categories/' })
    expect(meta.openGraph).toMatchObject({
      siteName: 'فایرفلای',
      url: '/categories/',
      locale: 'fa_IR',
    })
    expect(meta).not.toHaveProperty('robots')
  })
})
