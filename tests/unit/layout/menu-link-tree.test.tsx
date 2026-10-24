import { readFileSync } from 'node:fs'
import type { ReactNode } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { navItems } from '@/components/layout/menu-tree'
import { SiteHeader } from '@/components/layout/site-header'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'
import type { FeatureMap } from '@/features/settings/feature-context'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import type { MenuNode } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { menuNode, sampleTree } from './support'

// The main menu's links in the server's HTML (spec §8.13): the mega-menu and the drawer load their
// panels on demand, so the header carries the whole menu (`menu/main`, or the category tree while
// it is empty) as a hidden list of plain links, for crawlers. No client code: a Server Component.

const mocks = vi.hoisted(() => ({ main: [] as MenuNode[] }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn() }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv: parse } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parse({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})
vi.mock('@/lib/api/client', async () => {
  const { cart, result } = await import('../cart/support')
  return { bffFetch: async () => result(cart()) }
})
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => null,
  getMenu: async (key: string) => (key === 'main' ? mocks.main : []),
  getCategoryTree: async () => sampleTree(),
  getTranslations: async () => ({}),
}))

const config = toPublicConfig(
  resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  ),
)
const features = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, { key, name: '', enabled: true, reason: null }]),
) as FeatureMap

async function serverHtml() {
  const header: ReactNode = await SiteHeader()
  return renderToString(
    <Providers
      config={config}
      auth={emailOnlyAuth()}
      features={features}
      translations={{}}
      hasSession={false}
    >
      {header}
    </Providers>,
  )
}

/** Every link URL of a menu, depth first. */
const urls = (nodes: MenuNode[]): string[] =>
  nodes.flatMap((node) => [...(node.url === null ? [] : [node.url]), ...urls(node.children)])

const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const hrefs = (root: ParentNode) =>
  [...root.querySelectorAll('a[href]')].map((link) => link.getAttribute('href'))
/** The hidden list: the only one, and its nested lists not hidden themselves. */
const hiddenTree = (html: string) => {
  const lists = parse(html).querySelectorAll('ul[hidden]')
  expect(lists).toHaveLength(1)
  return lists[0]!
}

const MAIN = [
  menuNode({
    id: 1,
    title: 'کالای دیجیتال',
    url: null,
    children: [
      menuNode({
        id: 2,
        title: 'گوشی موبایل',
        url: '/product-category/digital/mobile-phone/',
        link_type: 'product_category',
        children: [
          menuNode({ id: 3, title: 'سامسونگ', url: '/brand/samsung/', link_type: 'brand' }),
          menuNode({
            id: 4,
            title: 'گوشی‌های پرچمدار',
            url: '/product/list/flagship-phones/',
            link_type: 'product_list',
            children: [menuNode({ id: 5, title: 'راهنما', url: '/blog/best-phones-under-30m/' })],
          }),
        ],
      }),
    ],
  }),
  menuNode({ id: 6, title: 'درباره ما', url: 'https://shop.ir/page/about-us/', link_type: 'page' }),
  menuNode({
    id: 7,
    title: 'آپارات',
    url: 'https://www.aparat.com/firefly',
    open_in_new_tab: true,
  }),
]

beforeEach(() => {
  mocks.main = MAIN
})

describe('the header’s menu links in the server HTML', () => {
  it('every `menu/main` URL is an <a href>, at every depth, own-origin URLs as paths', async () => {
    const found = hrefs(parse(await serverHtml()))
    const expected = urls(MAIN).map((url) => url.replace('https://shop.ir', ''))
    expect(expected).toHaveLength(6)
    for (const url of expected) expect(found, url).toContain(url)
  })

  it('every category of the tree while `menu/main` is empty (`navItems`)', async () => {
    mocks.main = []
    const found = hrefs(parse(await serverHtml()))
    const expected = urls(navItems([], sampleTree()))
    expect(expected).toEqual([
      '/product-category/digital/',
      '/product-category/digital/mobile-phone/',
      '/product-category/digital/laptop/',
      '/product-category/home-appliance/',
    ])
    for (const url of expected) expect(found, url).toContain(url)
  })

  it('is a hidden list: out of the page, the accessibility tree and the tab order', async () => {
    const tree = hiddenTree(await serverHtml())
    expect(tree.closest('nav')?.getAttribute('aria-label')).toBe('منوی اصلی')
    expect(hrefs(tree)).toEqual(urls(MAIN).map((url) => url.replace('https://shop.ir', '')))
    // Plain anchors: no target, no handler, no prefetch (a post counts a view on every GET, P5-R1).
    for (const link of tree.querySelectorAll('a')) {
      expect([...link.attributes].map((attribute) => attribute.name)).toEqual(['href'])
    }
    expect(tree.querySelector('a[href="/brand/samsung/"]')?.textContent).toBe('سامسونگ')
  })

  it('ships no client code: a Server Component of plain elements', () => {
    const source = readFileSync('src/components/layout/menu-link-tree.tsx', 'utf8')
    expect(source).not.toMatch(/^['"]use client['"]/m)
    expect(source).not.toMatch(/from 'next\/link'|from 'react'|useState|useEffect/)
  })
})
