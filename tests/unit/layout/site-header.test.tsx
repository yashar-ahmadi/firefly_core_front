import { render, screen, within } from '@testing-library/react'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { CategoriesDrawer } from '@/components/layout/categories-drawer'
import { MegaMenu } from '@/components/layout/mega-menu'
import { categoriesToMenu } from '@/components/layout/menu-tree'
import { SiteHeader } from '@/components/layout/site-header'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'
import type { FeatureMap } from '@/features/settings/feature-context'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import type { MenuNode, SiteSettings } from '@/lib/api/types/settings'
import { stubBrowserApis } from '../support/dom-stubs'
import { menuNode, sampleTree } from './support'

const mocks = vi.hoisted(() => ({
  settings: null as SiteSettings | null,
  menus: {} as Record<string, MenuNode[]>,
  pathname: '/',
}))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
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
// The header's cart badge reads the cart through the BFF: a guest without a cart.
vi.mock('@/lib/api/client', async () => {
  const { cart, result } = await import('../cart/support')
  return { bffFetch: async () => result(cart()) }
})
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => mocks.settings,
  getMenu: async (key: string) => mocks.menus[key] ?? [],
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

function featureMap(registration = true): FeatureMap {
  return Object.fromEntries(
    FEATURE_KEYS.map((key) => [
      key,
      { key, name: '', enabled: key !== 'registration' || registration, reason: null },
    ]),
  ) as FeatureMap
}

async function renderHeader(options: { hasSession?: boolean; registration?: boolean } = {}) {
  const header: ReactNode = await SiteHeader()
  return render(
    <Providers
      config={config}
      features={featureMap(options.registration)}
      translations={{}}
      hasSession={options.hasSession ?? false}
    >
      {header}
    </Providers>,
  )
}

const SETTINGS = {
  name: 'فایرفلای',
  logo: 'https://api.shop.ir/media/site-logo.png',
  phone: '+982191000000',
  announcement: '<p>ارسال <strong>رایگان</strong> برای سفارش&zwnj;های بالای ۱۰ میلیون تومان.</p>',
} as SiteSettings

beforeEach(() => {
  stubBrowserApis()
  sessionStorage.clear()
  mocks.settings = { ...SETTINGS }
  mocks.menus = {
    main: [],
    header: [menuNode({ id: 1, title: 'تخفیف‌ها', url: '/product/list/?has_discount=true' })],
  }
  mocks.pathname = '/'
})

describe('SiteHeader', () => {
  it('shows the logo named after the shop, linking home, and the search', async () => {
    await renderHeader()
    const banner = screen.getByRole('banner')
    const logo = within(banner).getByRole('img', { name: 'فایرفلای' })
    expect(logo).toHaveAttribute('src', expect.stringContaining('site-logo.png'))
    expect(within(banner).getByRole('link', { name: 'فایرفلای' })).toHaveAttribute('href', '/')
    // Two forms (wider screens, then phones); CSS shows one of them.
    const searches = within(banner).getAllByRole('search', { hidden: true })
    expect(searches).toHaveLength(2)
    for (const search of searches) expect(search).toHaveAttribute('action', '/search/')
    const [wide, phone] = searches
    // Wider screens: the suggest box. Phones: a field that opens the search overlay.
    expect(within(wide!).getByRole('combobox', { hidden: true })).toHaveAttribute('name', 'q')
    const field = within(phone!).getByRole('searchbox', { hidden: true })
    expect(field).toHaveAttribute('name', 'q')
    expect(field).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('shows the announcement as plain text', async () => {
    await renderHeader()
    const region = screen.getByRole('region', { name: 'اطلاعیه' })
    expect(region).toHaveTextContent('ارسال رایگان برای سفارش\u{200C}های بالای ۱۰ میلیون تومان.')
    expect(region.querySelector('strong')).toBeNull()
  })

  it('has no announcement bar when the announcement is empty', async () => {
    mocks.settings = { ...SETTINGS, announcement: '<p> </p>' }
    await renderHeader()
    expect(screen.queryByRole('region', { name: 'اطلاعیه' })).toBeNull()
  })

  it('links the support phone, shown left to right in Persian digits', async () => {
    await renderHeader()
    const links = screen
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href') === 'tel:+982191000000')
    expect(links).toHaveLength(2)
    expect(links[1]).toHaveTextContent('پشتیبانی۰۲۱ ۹۱۰۰ ۰۰۰۰')
    expect(links[1].querySelector('[dir="ltr"]')).toHaveTextContent('۰۲۱ ۹۱۰۰ ۰۰۰۰')
  })

  it('names the main navigation and lists the header links', async () => {
    await renderHeader()
    const nav = screen.getByRole('navigation', { name: 'منوی اصلی' })
    expect(within(nav).getByRole('link', { name: 'تخفیف‌ها' })).toHaveAttribute(
      'href',
      '/product/list/?has_discount=true',
    )
    expect(within(nav).getAllByRole('button', { name: 'دسته‌بندی‌ها' })).toHaveLength(2)
  })

  it('falls back to the preset label and a wordmark without settings', async () => {
    mocks.settings = null
    await renderHeader()
    const banner = screen.getByRole('banner')
    expect(within(banner).getByRole('img', { name: 'فروشگاه' }).tagName).toBe('SPAN')
    expect(screen.queryByRole('region', { name: 'اطلاعیه' })).toBeNull()
    expect(
      screen.queryAllByRole('link').some((l) => l.getAttribute('href')?.startsWith('tel:')),
    ).toBe(false)
  })

  it('offers sign-in that returns to the page, and the cart', async () => {
    mocks.pathname = '/product/x/'
    await renderHeader()
    expect(screen.getByRole('link', { name: 'ورود | ثبت‌نام' })).toHaveAttribute(
      'href',
      '/login/?next=/product/x/',
    )
    expect(screen.getByRole('link', { name: 'سبد خرید' })).toHaveAttribute('href', '/cart/')
  })

  it('says only «ورود» while registration is off', async () => {
    await renderHeader({ registration: false })
    expect(screen.getByRole('link', { name: 'ورود' })).toHaveAttribute('href', '/login/')
  })

  it('shows the account menu to a signed-in visitor', async () => {
    await renderHeader({ hasSession: true })
    expect(screen.queryByRole('link', { name: /ورود/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'حساب من' })).toHaveAttribute('aria-haspopup', 'menu')
  })

  it('sends the navigation menus only the items they show, never the unused category tree', async () => {
    type Props = Record<string, unknown> & { children?: ReactNode }
    const walk = (node: ReactNode): ReactElement<Props>[] => {
      if (Array.isArray(node)) return node.flatMap(walk)
      if (!isValidElement<Props>(node)) return []
      return [node, ...walk(node.props.children)]
    }
    const navProps = async () =>
      walk(await SiteHeader())
        .filter((element) => element.type === MegaMenu || element.type === CategoriesDrawer)
        .map((element) => element.props)

    const main = [menuNode({ id: 1, title: 'سامسونگ', url: '/brand/samsung/' })]
    mocks.menus = { ...mocks.menus, main }
    const withMenu = await navProps()
    expect(withMenu).toHaveLength(2)
    for (const props of withMenu) {
      expect(props.items).toEqual(main)
      expect(props).not.toHaveProperty('categories')
      expect(props).not.toHaveProperty('menu')
    }

    // An empty main menu: the category tree, as menu items (no dates, counts or images).
    mocks.menus = { ...mocks.menus, main: [] }
    for (const props of await navProps()) {
      expect(props.items).toEqual(categoriesToMenu(sampleTree()))
    }
  })
})
