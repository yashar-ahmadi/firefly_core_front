import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CategoriesPage, { generateMetadata } from '@/app/(shop)/categories/page'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// `/categories/` (the phone's categories tab, the category tree's browser): indexable, so it has
// its canonical and the social cards like every indexable page (Plan 5 Task 7's audit: it had
// only a title), and its place in the shop (home › «دسته‌بندی‌ها») as BreadcrumbList JSON-LD
// (ruled in Task 7, carried into Task 8).

const mocks = vi.hoisted(() => ({ translations: {} as Record<string, string> }))

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => mocks.translations,
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

describe('the categories page’s structured data', () => {
  beforeEach(() => {
    mocks.translations = {}
  })

  async function blocks() {
    const { wrapper } = clientProviders()
    const { container } = render(
      (await resolveServerTree((await CategoriesPage()) as ReactNode)) as ReactNode,
      { wrapper },
    )
    return [...container.querySelectorAll('script[type="application/ld+json"]')].map(
      (script) => script.textContent ?? '',
    )
  }

  it('a BreadcrumbList: home › «دسته‌بندی‌ها», on the shop’s origin', async () => {
    const found = await blocks()
    expect(found.map((text) => JSON.parse(text) as unknown)).toEqual([
      {
        '@context': 'https://schema.org',
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'خانه', item: 'https://shop.ir/' },
          {
            '@type': 'ListItem',
            position: 2,
            name: 'دسته\u{200C}بندی\u{200C}ها',
            item: 'https://shop.ir/categories/',
          },
        ],
      },
    ])
  })

  it('escaped: an operator’s wording cannot end the script', async () => {
    mocks.translations = { categories: 'همه</script><b>' }
    const [text] = await blocks()
    expect(text).not.toContain('<')
    expect(JSON.parse(text!).itemListElement[1].name).toBe('همه</script><b>')
  })
})
