import { render, screen, within } from '@testing-library/react'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import CheckoutLayout, {
  dynamic as layoutDynamic,
  metadata as layoutMetadata,
} from '@/app/(checkout)/layout'
import CheckoutRoute, { dynamic, generateMetadata } from '@/app/(checkout)/checkout/page'
import CheckoutError from '@/app/(checkout)/error'
import { FeatureProvider } from '@/features/settings/feature-context'
import { menuNode } from '../layout/support'
import { clientProviders } from '../support/providers'
import { resolveServerTree } from '../support/server-tree'

// The `(checkout)` group (ruling P4-R3): a quiet frame (the logo home, «خرید امن», the way back
// to the cart; the support line and the legal links at the bottom) without the shop's search,
// mega menu, bottom navigation, compare bar or quick view; and `/checkout/` itself: noindex,
// rendered per request, titled, no loading.tsx (R9).

const PAGE_LINKS = [
  menuNode({ id: 1, title: 'قوانین و مقررات', url: '/page/terms/', link_type: 'page' }),
  menuNode({ id: 2, title: 'حریم خصوصی', url: '/page/privacy/', link_type: 'page' }),
]
const SEAL =
  '<a href="https://trustseal.enamad.ir/?id=1"><img src="https://trustseal.enamad.ir/logo.aspx?id=1" alt="نماد اعتماد الکترونیکی"></a>'

const mocks = vi.hoisted(() => ({ menu: [] as unknown[], snippets: [] as unknown[] }))

vi.mock('server-only', () => ({}))
// The message slots are checkout-slots.test.tsx's: none here.
vi.mock('@/features/content/dynamic/api', () => ({ getDynamicContent: async () => null }))
vi.mock('next/headers', () => ({
  // An ordinary page, as the proxy marks it (operator code renders only there).
  headers: async () => new Headers({ 'x-ff-route-kind': 'page' }),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getSnippets: async () => mocks.snippets,
  getSiteSettings: async () => ({
    name: 'فایرفلای',
    logo: null,
    phone: '+982191000000',
    response_time: 'شنبه تا چهارشنبه ۹ تا ۱۸',
  }),
  getMenu: async () => mocks.menu,
}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({
    name: 'فایرفلای',
    siteUrl: 'http://localhost:3000',
    apiUrl: 'http://localhost:8000',
  }),
}))

function wrapper({ children }: { children: ReactNode }) {
  const { wrapper: Wrapper } = clientProviders()
  return (
    <FeatureProvider initial={{}}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
}

beforeEach(() => {
  mocks.menu = PAGE_LINKS
  mocks.snippets = []
})

const renderLayout = async () =>
  render(await resolveServerTree(CheckoutLayout({ children: <p>page</p> })), { wrapper })

describe('the (checkout) layout', () => {
  it('a minimal header and footer around <main id="main">, never indexed', async () => {
    await renderLayout()
    const header = screen.getByRole('banner')
    expect(within(header).getByRole('link', { name: 'فایرفلای' })).toHaveAttribute('href', '/')
    expect(header).toHaveTextContent('خرید امن')
    expect(within(header).getByRole('link', { name: 'بازگشت به سبد خرید' })).toHaveAttribute(
      'href',
      '/cart/',
    )
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main')
    expect(screen.getByRole('main')).toHaveTextContent('page')
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('link', { name: /۰۲۱/ })).toHaveAttribute(
      'href',
      'tel:+982191000000',
    )
    expect(footer).toHaveTextContent('شنبه تا چهارشنبه ۹ تا ۱۸')
    expect(within(footer).getByRole('link', { name: 'قوانین و مقررات' })).toHaveAttribute(
      'href',
      '/page/terms/',
    )
    // The shop's own navigation stays out.
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'منوی پایین' })).not.toBeInTheDocument()
    // The polite live region the checkout's announcements go to.
    expect(screen.getByRole('status')).toHaveAttribute('aria-live', 'polite')
    expect(layoutMetadata.robots).toEqual({ index: false, follow: true })
    expect(layoutDynamic).toBe('force-dynamic')
  })

  it('the trust seals sit in the footer under «نمادهای اعتماد», only when there are some', async () => {
    const first = await renderLayout()
    expect(screen.queryByRole('group', { name: 'نمادهای اعتماد' })).toBeNull()
    first.unmount()
    mocks.snippets = [
      { id: 7, description: '', position: 'bottom_of_body', type: 'script', snippet: SEAL },
    ]
    await renderLayout()
    const trust = within(screen.getByRole('contentinfo')).getByRole('group', {
      name: 'نمادهای اعتماد',
    })
    expect(within(trust).getByRole('img', { name: 'نماد اعتماد الکترونیکی' })).toBeInTheDocument()
    expect(trust.querySelector('[data-snippet-zone="bottom"]')).not.toBeNull()
  })

  it('the footer links are the menu’s pages only (children too), at most four', async () => {
    const page = (id: number, slug: string) =>
      menuNode({ id, title: `صفحه ${id}`, url: `/page/${slug}/`, link_type: 'page' })
    mocks.menu = [
      menuNode({
        id: 10,
        title: 'تخفیف‌ها',
        url: '/product-list/sale/',
        link_type: 'product_list',
      }),
      menuNode({
        id: 11,
        title: 'راهنما',
        url: null,
        link_type: 'none',
        children: [page(12, 'help'), page(13, 'faq')],
      }),
      menuNode({ id: 14, title: 'وبلاگ', url: 'https://blog.example.com/', link_type: 'url' }),
      page(15, 'terms'),
      page(16, 'privacy'),
      page(17, 'returns'),
    ]
    await renderLayout()
    const links = within(screen.getByRole('contentinfo'))
      .getAllByRole('link')
      .filter((link) => link.getAttribute('href')?.startsWith('/'))
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/page/help/',
      '/page/faq/',
      '/page/terms/',
      '/page/privacy/',
    ])
  })
})

describe('the (checkout) error boundary', () => {
  it('says what happened in place of the page, and retries', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    const retry = vi.fn()
    render(<CheckoutError error={new Error('boom')} reset={vi.fn()} retry={retry} />, { wrapper })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'مشکلی پیش آمد' }),
    ).toBeInTheDocument()
    screen.getByRole('button', { name: 'تلاش دوباره' }).click()
    expect(retry).toHaveBeenCalledTimes(1)
    consoleError.mockRestore()
  })
})

describe('/checkout/', () => {
  it('is titled «تکمیل خرید», never indexed, and rendered per request', async () => {
    const meta = await generateMetadata()
    expect(meta.title).toBe('تکمیل خرید')
    expect(meta.robots).toEqual({ index: false, follow: true })
    expect(dynamic).toBe('force-dynamic')
  })

  it('renders its heading, then the checkout read in the browser', async () => {
    render(await resolveServerTree(await CheckoutRoute()), { wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'تکمیل خرید' })).toBeInTheDocument()
    expect(screen.getByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
  })

  it('has no loading.tsx (it would turn errors into soft 200s)', () => {
    for (const dir of ['src/app/(checkout)/', 'src/app/(checkout)/checkout/']) {
      for (const name of ['loading.tsx', 'loading.ts', 'loading.jsx', 'loading.js']) {
        expect(existsSync(join(process.cwd(), dir, name)), `${dir}${name}`).toBe(false)
      }
    }
  })
})
