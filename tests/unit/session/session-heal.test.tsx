import { useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { useSession } from '@/lib/session/session-context'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// A page that mounts saying «no session» while the session flag cookie says there is one (Plan 5
// final fix wave). The server never renders that (it renders for the cookie it was sent): the
// service worker's kept copy of the home page does, served to a slow navigation after 4 s or
// offline, with the guest's header. The shop-wide sweep sets it right on mount, as for a login
// in another tab: the tab takes the session and asks the server once (router.refresh). Never a
// loop: the same login's copy shown again within a minute (the refresh could not reach the server
// and Next loaded the address again) is left as it is.

const mocks = vi.hoisted(() => {
  const refresh = vi.fn()
  return { refresh, reloadPage: vi.fn(), router: { replace: vi.fn(), refresh, push: vi.fn() } }
})
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  reloadPage: mocks.reloadPage,
  loadPage: vi.fn(),
}))

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

function Header() {
  const { hasSession } = useSession()
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => ({ full_name: 'سارا احمدی' }),
    enabled: hasSession,
  })
  return (
    <>
      <output aria-label="session">{String(hasSession)}</output>
      <output aria-label="name">{me.data?.full_name ?? ''}</output>
    </>
  )
}

function mount(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(CART_KEY, { item_count: 0 })
  const view = render(
    <>
      <SessionSwitchSweep />
      <Header />
    </>,
    { wrapper: providers.wrapper },
  )
  return { client: providers.client, unmount: view.unmount }
}

const session = () => screen.getByRole('status', { name: 'session' })
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))

beforeAll(async () => {
  await import('@/lib/session/session-sweep-action')
})

beforeEach(() => {
  vi.clearAllMocks()
  sessionStorage.clear()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  flagCookie(null)
  vi.restoreAllMocks()
})

describe('a page the worker kept: no session, the flag cookie set', () => {
  it('is set right on mount: the session taken, the guest’s reads gone, one server render', async () => {
    flagCookie('login-a-0123456789')
    const { client } = mount(false)
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(session()).toHaveTextContent('true')
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('never loops: the same login’s copy again within a minute is left as it is', async () => {
    let now = 1_800_000_000_000
    vi.spyOn(Date, 'now').mockImplementation(() => now)
    const load = async () => {
      const view = mount(false)
      await settle()
      view.unmount()
    }
    flagCookie('login-a-0123456789')
    await load()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    // The refresh could not reach the server: Next loads the address again, the same copy.
    now += 5_000
    await load()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    // A minute on, or another login: set right again.
    now += 60_000
    await load()
    expect(mocks.refresh).toHaveBeenCalledTimes(2)
    flagCookie('login-b-0123456789')
    mount(false)
    await settle()
    expect(mocks.refresh).toHaveBeenCalledTimes(3)
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('without session storage to remember it by: left as it is (no loop possible)', async () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('refused', 'SecurityError')
    })
    flagCookie('login-a-0123456789')
    mount(false)
    await settle()
    expect(session()).toHaveTextContent('false')
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})

describe('a page rendered for its cookie: nothing on mount', () => {
  it.each<[string, boolean, string | null]>([
    ['a session and its cookie', true, 'login-a-0123456789'],
    ['a guest without one', false, null],
    // A session without the cookie goes through the session's end when a read answers 401, as
    // before: never on mount.
    ['a session without its cookie', true, null],
  ])('%s', async (_, hasSession, marker) => {
    flagCookie(marker)
    mount(hasSession)
    await settle()
    expect(session()).toHaveTextContent(String(hasSession))
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
    expect(sessionStorage.length).toBe(0)
  })
})
