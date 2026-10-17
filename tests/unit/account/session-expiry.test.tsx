import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountShell } from '@/features/account/layout/account-shell'
import { ApiError } from '@/lib/api/errors'
import { SARA } from '../auth/fixtures'
import { ok } from './fixtures'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { resolveServerTree } from '../support/server-tree'

// Review Focus #4: the session ends while an account page is open (the BFF's one refresh
// failed: every session read answers 401). The page goes to login once, with itself and its
// query as `next`; nothing asks again (no loop), and no section flashes an error on the way.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return { pathname: '/account/', bffFetch: vi.fn(), replace, router: { replace, push: vi.fn() } }
})
vi.mock('server-only', () => ({}))
vi.mock('@/features/account/dashboard/banners-api', () => ({ getDashboardBanners: async () => [] }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}))

const expired = () =>
  Promise.reject(new ApiError({ status: 401, code: 'token_not_valid', detail: 'منقضی' }))

beforeEach(() => {
  stubBrowserApis()
  vi.clearAllMocks()
  mocks.bffFetch.mockImplementation(expired)
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

async function openPage(url: string, node: ReactNode) {
  window.history.replaceState(null, '', url)
  mocks.pathname = new URL(url, 'http://shop.test').pathname
  const providers = authProviders({ hasSession: true })
  render(<AccountShell>{await resolveServerTree(node)}</AccountShell>, {
    wrapper: providers.wrapper,
  })
  return providers.client
}

/** Every read the page made, by path. */
const reads = () => mocks.bffFetch.mock.calls.map(([path]) => path as string)

describe('a session that ends on an account page', () => {
  it('the dashboard: the profile, summary and purchases all answer 401 → one replace to login', async () => {
    const { default: DashboardPage } = await import('@/app/(shop)/account/page')
    const client = await openPage('/account/', DashboardPage())
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    // Let every failing read settle: still one navigation, the page itself as next.
    await waitFor(() =>
      expect(new Set(reads())).toEqual(
        new Set(['account/profile/me/', 'dashboard/summary/', 'dashboard/purchased-product/list/']),
      ),
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login/?next=/account/')
    expect(mocks.router.push).not.toHaveBeenCalled()
    // No loop: each read was made once, and none is retried with the session gone.
    expect(reads()).toHaveLength(3)
    // The visitor's data is gone; the sections keep their skeletons (no error, no retry).
    expect(client.getQueryData(['summary'])).toBeUndefined()
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
    expect(screen.getByTestId('summary-cards')).toHaveAttribute('aria-busy', 'true')
  })

  it('a placeholder page with a query: back to it after login', async () => {
    const { default: OrdersPage } = await import('@/app/(shop)/account/orders/page')
    await openPage('/account/orders/?group=delivered', <OrdersPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(
      '/login/?next=/account/orders/%3Fgroup%3Ddelivered',
    )
  })

  it('the summary alone answers 401 (the profile was read before): the same single replace', async () => {
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'account/profile/me/' ? Promise.resolve(ok(SARA)) : expired(),
    )
    const { default: WalletPage } = await import('@/app/(shop)/account/wallet/page')
    await openPage('/account/wallet/', <WalletPage />)
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login/?next=/account/wallet/')
    expect(reads().filter((path) => path === 'dashboard/summary/')).toHaveLength(1)
  })

  it('a 401 that is no session problem (a bad API key) keeps the visitor here', async () => {
    mocks.bffFetch.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 401, code: 'api_key_invalid' })),
    )
    const { default: OrdersPage } = await import('@/app/(shop)/account/orders/page')
    await openPage('/account/orders/', <OrdersPage />)
    await waitFor(() => expect(reads().length).toBeGreaterThanOrEqual(2))
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
