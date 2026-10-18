import { useQuery } from '@tanstack/react-query'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { usePathname } from 'next/navigation'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useLogout } from '@/features/auth/use-logout'
import { HeartButton } from '@/features/wishlist/heart-button'
import { useSession } from '@/lib/session/session-context'
import { AfterLogoutSweep } from '@/lib/session/after-logout'
import { cart, result } from '../cart/support'
import { clientProviders } from '../support/providers'

// What a logout leaves behind on the page, without a reload: nothing of the visitor, whether
// the cleanup registry (`SESSION_QUERIES`) knows the query or not, and nothing on screen that
// is the same for everyone gets detached from the cache.

const nav = vi.hoisted(() => {
  const listeners = new Set<() => void>()
  const state = {
    pathname: '/account/orders/',
    /** Held: the navigation home commits when the test says so. */
    hold: false,
    listeners,
    commit(pathname: string) {
      state.pathname = pathname
      for (const listener of listeners) listener()
    },
  }
  const replace = vi.fn((href: string) => {
    if (!state.hold) state.commit(href)
  })
  return { state, replace, logout: vi.fn(), bffFetch: vi.fn() }
})
vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react')
  const subscribe = (listener: () => void) => {
    nav.state.listeners.add(listener)
    return () => nav.state.listeners.delete(listener)
  }
  return {
    usePathname: () => useSyncExternalStore(subscribe, () => nav.state.pathname),
    useRouter: () => ({ replace: nav.replace, push: vi.fn() }),
  }
})
vi.mock('@/features/auth/api', () => ({ authApi: { logout: nav.logout } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: nav.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => true,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const SAVED_ID = 10001

beforeEach(() => {
  vi.clearAllMocks()
  nav.state.pathname = '/account/orders/'
  nav.state.hold = false
  window.history.replaceState(null, '', '/account/orders/')
  nav.logout.mockResolvedValue({})
  nav.bffFetch.mockImplementation(async (path: string) =>
    path === 'product/wishlist/list/'
      ? {
          data: { count: 1, next: null, previous: null, results: [{ id: SAVED_ID }] },
          msg: '',
          status: 200,
        }
      : result(cart()),
  )
})

afterEach(() => {
  window.history.replaceState(null, '', '/')
})

/** A query an account page reads, keyed outside the cleanup registry, not gated on the session. */
function OrdersPage() {
  const { data } = useQuery({ queryKey: ['unregistered', 'list'], queryFn: async () => ['#1001'] })
  return <p>orders: {data?.join(',')}</p>
}

/** A query on the layout, the same for everyone: stays on screen across the logout. */
function CategoryTree() {
  const { data } = useQuery({ queryKey: ['categories', 'tree'], queryFn: async () => 'tree-1' })
  return <p>tree: {data}</p>
}

/** Session-gated, outside the registry, on the layout: still mounted after the logout. */
function SavedAddresses() {
  const { hasSession } = useSession()
  useQuery({
    queryKey: ['addresses'],
    queryFn: async () => ['home'],
    enabled: hasSession,
  })
  return null
}

function Page() {
  return usePathname() === '/' ? <p>home</p> : <OrdersPage />
}

function LogoutButton() {
  const { logout } = useLogout()
  return (
    <button type="button" onClick={() => void logout()}>
      خروج
    </button>
  )
}

function renderShell() {
  const providers = clientProviders({ hasSession: true })
  render(
    <>
      <AfterLogoutSweep />
      <CategoryTree />
      <SavedAddresses />
      <HeartButton productId={SAVED_ID} slug="samsung-galaxy-s25-ultra" />
      <Page />
      <LogoutButton />
    </>,
    { wrapper: providers.wrapper },
  )
  return { user: userEvent.setup(), client: providers.client }
}

describe('after a logout, without a reload', () => {
  it('drops the queries of the page it left once the navigation home has committed', async () => {
    nav.state.hold = true
    const { user, client } = renderShell()
    await screen.findByText('orders: #1001')
    await screen.findByText('tree: tree-1')
    await waitFor(() => expect(client.getQueryData(['addresses'])).toEqual(['home']))

    await user.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(nav.replace).toHaveBeenCalledWith('/'))
    // Session-gated and on screen: the flag went off first, so the first sweep took it.
    expect(client.getQueryData(['addresses'])).toBeUndefined()
    // The account page is still on screen: its query is still observed.
    expect(client.getQueryData(['unregistered', 'list'])).toEqual(['#1001'])

    act(() => nav.state.commit('/'))
    expect(screen.getByText('home')).toBeInTheDocument()
    expect(client.getQueryData(['unregistered', 'list'])).toBeUndefined()
    // The layout's public query stayed, and still updates what is on screen.
    expect(client.getQueryData(['categories', 'tree'])).toBe('tree-1')
    act(() => client.setQueryData(['categories', 'tree'], 'tree-2'))
    expect(await screen.findByText('tree: tree-2')).toBeInTheDocument()
  })

  it('the hearts on screen turn back to unsaved', async () => {
    const { user } = renderShell()
    const heart = await screen.findByRole('button', { name: 'حذف از علاقه\u{200C}مندی\u{200C}ها' })
    expect(heart).toHaveAttribute('aria-pressed', 'true')
    await user.click(screen.getByRole('button', { name: 'خروج' }))
    await waitFor(() => expect(heart).toHaveAttribute('aria-pressed', 'false'))
    expect(heart).toHaveAccessibleName('افزودن به علاقه\u{200C}مندی\u{200C}ها')
  })
})
