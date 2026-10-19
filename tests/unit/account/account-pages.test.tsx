import { render, screen, within } from '@testing-library/react'
import { isValidElement, Suspense, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountShell } from '@/features/account/layout/account-shell'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { resolveServerTree } from '../support/server-tree'
import { banner, ok, page, PURCHASES, summary } from './fixtures'

// The account pages inside their shell: the dashboard (the hub below lg), and a page beside the
// shell's side column (every page is built now: the reading list was the last placeholder).

const mocks = vi.hoisted(() => ({ pathname: '/account/', banners: vi.fn() }))
vi.mock('server-only', () => ({}))
vi.mock('@/features/account/dashboard/banners-api', () => ({
  getDashboardBanners: mocks.banners,
}))
vi.mock('@/features/blog/api', () => ({ getBlogCategories: async () => [] }))
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string) => {
    if (path === 'dashboard/summary/') return ok(summary())
    if (path === 'account/profile/me/') return ok(SARA)
    if (path === 'dashboard/purchased-product/list/') return ok(page(PURCHASES, 7))
    // The unread count the shell keeps (none unread).
    if (path === 'notification/list/') return ok(page([], 0))
    // The reading list's page and its bookmarks' ids (nothing saved).
    if (path === 'blog/reading-list/list/') return ok(page([], 0))
    throw new Error(`unexpected ${path}`)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}))

beforeEach(() => {
  stubBrowserApis()
  mocks.pathname = '/account/'
  mocks.banners.mockResolvedValue([])
  // Signed in as the server saw it: the session flag cookie is there (AccountSessionWatch).
  document.cookie = 'ff_auth=1; path=/'
})

afterEach(() => {
  document.cookie = 'ff_auth=; max-age=0; path=/'
})

async function renderInShell(node: ReactNode) {
  const providers = authProviders({ hasSession: true })
  render(<AccountShell>{await resolveServerTree(node)}</AccountShell>, {
    wrapper: providers.wrapper,
  })
}

/** The first element of a (server) tree that `match` accepts, children first-depth order. */
function findElement(
  node: unknown,
  match: (element: ReactElement) => boolean,
): ReactElement | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElement(child, match)
      if (found) return found
    }
    return undefined
  }
  if (!isValidElement(node)) return undefined
  if (match(node)) return node
  return findElement((node.props as { children?: unknown }).children, match)
}

/** The element holding `node`'s nav, with the breakpoint classes that show or hide it. */
const holder = (nav: HTMLElement) => nav.closest('.lg\\:hidden, .lg\\:block')

describe('the account shell', () => {
  it('puts the account card (who is signed in, the navigation) in a side column from lg', async () => {
    mocks.pathname = '/account/reading-list/'
    const { default: ReadingListPage } = await import('@/app/(shop)/account/reading-list/page')
    await renderInShell(await ReadingListPage())
    const navs = screen.getAllByRole('navigation', { name: 'حساب کاربری' })
    expect(navs).toHaveLength(1)
    const side = holder(navs[0]!)!
    expect(side.className).toMatch(/(^| )hidden( |$)/)
    expect(side.className).toContain('lg:block')
    expect(await within(side as HTMLElement).findByText('سارا احمدی')).toBeInTheDocument()
    expect(within(side as HTMLElement).getByText('sara.ahmadi@example.com')).toBeInTheDocument()
    expect(within(navs[0]!).getByRole('link', { name: /^لیست مطالعه/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
  })
})

describe('the dashboard', () => {
  async function renderDashboard() {
    const { default: DashboardPage } = await import('@/app/(shop)/account/page')
    await renderInShell(DashboardPage())
  }

  it('greets her and keeps the headings in order', async () => {
    await renderDashboard()
    expect(await screen.findByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    await screen.findAllByRole('article')
    const headings = screen.getAllByRole('heading').map((heading) => heading.tagName)
    expect(headings[0]).toBe('H1')
    expect(headings.filter((tag) => tag === 'H1')).toHaveLength(1)
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual([
      'سفارش‌های من',
      'آخرین خریدها',
    ])
  })

  it('is the hub below lg: every other account page as a large row, and «خروج»', async () => {
    await renderDashboard()
    const navs = screen.getAllByRole('navigation', { name: 'حساب کاربری' })
    expect(navs).toHaveLength(2)
    const hub = navs.find((nav) => holder(nav)?.className.includes('lg:hidden'))!
    expect(hub).toBeDefined()
    const rows = within(hub).getAllByRole('link')
    expect(rows).toHaveLength(9)
    expect(within(hub).queryByRole('link', { name: 'پیشخوان' })).toBeNull()
    for (const row of rows) expect(row.className).toContain('min-h-14')
    expect(within(hub).getByRole('button', { name: 'خروج' }).className).toContain('min-h-14')
    // Who is signed in heads the hub.
    expect(await within(holder(hub) as HTMLElement).findByText('سارا احمدی')).toBeInTheDocument()
  })

  it('shows the live banners after the latest purchases', async () => {
    mocks.banners.mockResolvedValue([banner()])
    await renderDashboard()
    // Loaded on demand (next/dynamic), and only because there is a banner.
    const carousel = await screen.findByRole('region', { name: 'پیشنهادهای ویژه' })
    const purchases = screen.getByRole('region', { name: 'آخرین خریدها' })
    expect(
      purchases.compareDocumentPosition(carousel) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy()
  })

  it('never waits for the banners: they stream, a skeleton of their frame in their place', async () => {
    mocks.banners.mockReturnValue(new Promise(() => {}))
    const { default: DashboardPage } = await import('@/app/(shop)/account/page')
    const page: unknown = await Promise.race([
      Promise.resolve(DashboardPage()),
      new Promise((resolve) => setTimeout(() => resolve('waited'), 200)),
    ])
    expect(page).not.toBe('waited')
    const boundary = findElement(page, (element) => element.type === Suspense)
    expect(boundary).toBeDefined()
    const { container } = render(<>{(boundary!.props as { fallback: ReactNode }).fallback}</>)
    const skeleton = container.querySelector('[data-banner-skeleton]')!
    expect(skeleton).toHaveAttribute('aria-hidden', 'true')
    expect(skeleton.className).toContain('aspect-[2/1]')
    expect(skeleton.className).toContain('md:aspect-[4/1]')
  })

  it('has no banner region when none is live', async () => {
    await renderDashboard()
    expect(screen.queryByRole('region', { name: 'پیشنهادهای ویژه' })).toBeNull()
  })
})
