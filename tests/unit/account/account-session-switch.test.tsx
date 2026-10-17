import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionWatch } from '@/features/account/layout/account-session-watch'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useSession } from '@/lib/session/session-context'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// An account (or checkout) page when the tab comes back, as the app mounts it: the shop-wide
// sweep (src/app/providers.tsx) listens, the account watch checks once when the page mounts.
// - first loaded signed in, signed out, then a login elsewhere: the tab takes the session itself
//   and asks the server once, never on every return;
// - `visibilitychange` and `focus` of one return: one check;
// - another login elsewhere: the page loads again (its HTML is the visitor's own).

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  const refresh = vi.fn()
  return { replace, refresh, reloadPage: vi.fn(), router: { replace, refresh, push: vi.fn() } }
})
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  reloadPage: mocks.reloadPage,
  loadPage: vi.fn(),
}))

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/account/profile/')
})

afterEach(() => {
  flagCookie(null)
  window.history.replaceState(null, '', '/')
})

function Flag() {
  const { hasSession, setHasSession } = useSession()
  return (
    <>
      <output aria-label="session">{String(hasSession)}</output>
      <button type="button" onClick={() => setHasSession(false)}>
        خروج
      </button>
    </>
  )
}

function renderPage(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(ME_KEY, { uuid: 'sara-uuid', full_name: 'سارا احمدی' })
  providers.client.setQueryData(SUMMARY_KEY, { wishlist_count: 2 })
  render(
    <>
      <SessionSwitchSweep />
      <AccountSessionWatch />
      <Flag />
    </>,
    { wrapper: providers.wrapper },
  )
  return providers.client
}

const flag = () => screen.getByRole('status', { name: 'session' })
// The action's code loads on demand: loaded once here, and given a moment after each event.
beforeAll(async () => {
  await import('@/lib/session/session-sweep-action')
})
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
async function focus() {
  act(() => void window.dispatchEvent(new Event('focus')))
  await settle()
}
async function shown() {
  act(() => void document.dispatchEvent(new Event('visibilitychange')))
  await settle()
}
const LOGIN = '/login/?next=/account/profile/'

describe('an account page when the tab comes back', () => {
  it('first loaded signed in, signed out, then a login elsewhere: takes it, one refresh', async () => {
    flagCookie('login-a-0123456789')
    const client = renderPage(true)
    act(() => screen.getByRole('button', { name: 'خروج' }).click())
    flagCookie(null)
    client.setQueryData(CART_KEY, { item_count: 1 })
    flagCookie('login-b-0123456789')
    await focus()
    expect(flag()).toHaveTextContent('true')
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    await shown()
    await focus()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('visibilitychange then focus, after the session ended elsewhere: login replaces it once', async () => {
    flagCookie('login-a-0123456789')
    const client = renderPage(true)
    flagCookie(null)
    await shown()
    await focus()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN)
    expect(client.getQueryData(ME_KEY)).toBeNull()
  })

  it.each([
    ['an account page, from a session marker', '/account/profile/', 'login-a-0123456789'],
    ['an account page, from a session before markers', '/account/', '1'],
    ['the checkout', '/checkout/', 'login-a-0123456789'],
  ])(
    'another login elsewhere on %s: the data goes and the page loads again, once',
    async (_, path, before) => {
      window.history.replaceState(null, '', path)
      flagCookie(before)
      const client = renderPage(true)
      flagCookie('login-b-0123456789')
      await shown()
      await focus()
      expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
      expect(client.getQueryData(ME_KEY)).toBeUndefined()
      expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
      expect(mocks.replace).not.toHaveBeenCalled()
    },
  )
})
