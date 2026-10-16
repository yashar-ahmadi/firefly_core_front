import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CategoriesDrawer } from '@/components/layout/categories-drawer'
import { HeaderActions } from '@/components/layout/header-actions'
import { HeaderLinks } from '@/components/layout/header-links'
import { navItems } from '@/components/layout/menu-tree'
import { ConsiderBeforeBuying } from '@/features/catalog/components/consider-before-buying'
import { FeatureProvider } from '@/features/settings/feature-context'
import { menuNode, sampleTree } from '../layout/support'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// The header's panels and menus load their code on first use. Each download can fail (a stale
// chunk after a deploy, a dropped connection): each must degrade where it is, never reach the
// root error page. Opened with fireEvent: no hover or focus preload runs alongside the loader
// (Vitest hands a concurrent second import of a failing mock the real module; browsers fail
// both).

const mocks = vi.hoisted(() => ({
  loadPage: vi.fn(),
  reloadPage: vi.fn(),
  /** A module whose export cannot be read: every load fails the way a missing chunk does. */
  broken: (name: string) =>
    Object.defineProperty({}, name, {
      enumerable: true,
      get() {
        throw new Error('ChunkLoadError: Loading chunk failed.')
      },
    }),
}))

vi.mock('@/features/cart/components/mini-cart', () => mocks.broken('MiniCart'))
vi.mock('@/components/layout/categories-drawer-panel', () => mocks.broken('CategoriesDrawerPanel'))
vi.mock('@/components/layout/account-menu', () => mocks.broken('AccountMenu'))
vi.mock('@/components/layout/header-dropdown', () => mocks.broken('HeaderDropdown'))
vi.mock('@/features/catalog/components/reading-dialog', () => mocks.broken('ReadingDialog'))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: mocks.reloadPage,
}))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/navigation', () => ({ usePathname: () => '/', useRouter: () => ({ push: vi.fn() }) }))

const media = stubBrowserApis()
let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  mocks.loadPage.mockReset()
  mocks.reloadPage.mockReset()
  media.set(minWidth(48))
  consoleError = vi.spyOn(console, 'error')
})

afterEach(() => {
  // Nothing was thrown to an error boundary (React reports those on console.error).
  expect(consoleError).not.toHaveBeenCalled()
  consoleError.mockRestore()
})

function withProviders(ui: ReactNode, hasSession = false) {
  const { wrapper: Base } = clientProviders({ hasSession })
  return render(
    <Base>
      <FeatureProvider initial={{}}>
        <main>the page</main>
        {ui}
      </FeatureProvider>
    </Base>,
  )
}

describe('header widgets whose code cannot load', () => {
  it('the mini-cart: the cart page opens, and the icon is a plain link again', async () => {
    withProviders(<HeaderActions />)
    const link = await screen.findByRole('link', { name: /^سبد خرید/ })
    await waitFor(() => expect(link).toHaveAttribute('aria-haspopup', 'dialog'))
    fireEvent.click(link)
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/cart/'))
    expect(link).not.toHaveAttribute('aria-haspopup')
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it('the categories drawer: the categories page opens', async () => {
    withProviders(<CategoriesDrawer items={navItems([], sampleTree())} />)
    fireEvent.click(screen.getByRole('button', { name: 'دسته‌بندی‌ها' }))
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/categories/'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.getByText('the page')).toBeInTheDocument()
  })

  it('the account menu: the account page opens', async () => {
    withProviders(<HeaderActions />, true)
    const button = await screen.findByRole('button', { name: 'حساب من' })
    expect(button).toHaveAttribute('aria-haspopup', 'menu')
    fireEvent.click(button)
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith('/account/'))
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).not.toHaveAttribute('aria-busy')
  })

  it('a header menu: its own page opens, or the page reloads when it has none', async () => {
    withProviders(
      <HeaderLinks
        items={[
          menuNode({
            id: 1,
            title: 'راهنما',
            url: null,
            children: [menuNode({ id: 2, title: 'ارسال', url: '/page/shipping/' })],
          }),
          menuNode({
            id: 3,
            title: 'تخفیف‌ها',
            url: '/product/list/?has_discount=true',
            children: [menuNode({ id: 4, title: 'شگفت‌انگیز', url: '/product/list/x/' })],
          }),
        ]}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'راهنما' }))
    await waitFor(() => expect(mocks.reloadPage).toHaveBeenCalledTimes(1))
    fireEvent.keyDown(screen.getByRole('button', { name: 'تخفیف‌ها' }), { key: 'Enter' })
    await waitFor(() =>
      expect(mocks.loadPage).toHaveBeenCalledWith('/product/list/?has_discount=true'),
    )
    expect(screen.queryByRole('menu')).toBeNull()
  })
})

describe('a reading dialog whose code cannot load', () => {
  it("shows the operator's text in place, under its card", async () => {
    withProviders(
      <ConsiderBeforeBuying
        data={{ title: 'پیش از خرید', text: '<p>به باتری توجه کنید.</p>', button: 'نکات' }}
      />,
    )
    const button = screen.getByRole('button', { name: 'نکات' })
    fireEvent.click(button)
    const region = await screen.findByRole('region', { name: 'پیش از خرید' })
    expect(region).toHaveTextContent('به باتری توجه کنید.')
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(button).toHaveAttribute('aria-expanded', 'true')
  })
})
