import { useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { KeptCopySession } from '@/lib/session/kept-copy-session'
import { useSession } from '@/lib/session/session-context'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// A page that mounts saying «no session» while the session flag cookie says there is one (Plan 5
// final fix wave). The server never renders that (the root layout's `hasSession` is this very
// cookie): the service worker's kept copy of the home page does, served to a slow navigation after
// 4 s or offline, with the guest's header. It is set right on mount, in place: the tab takes the
// cookie's session (the page's own reads went out with the visitor's cookies, so nothing else
// differs) and asks nothing of the network, so no reload, no server render and no loop can follow.

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

/** A shop page as it mounts: the root providers' sweep, the shop layout's heal, the header. */
function mount(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(CART_KEY, { item_count: 0 })
  const view = render(
    <>
      <KeptCopySession />
      <Header />
      <SessionSwitchSweep />
    </>,
    { wrapper: providers.wrapper },
  )
  return { client: providers.client, unmount: view.unmount }
}

const session = () => screen.getByRole('status', { name: 'session' })
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
const nothingLoaded = () => {
  expect(mocks.refresh).not.toHaveBeenCalled()
  expect(mocks.reloadPage).not.toHaveBeenCalled()
  expect(mocks.router.replace).not.toHaveBeenCalled()
}

// A switch later on loads the sweep's action: loaded once here.
beforeAll(async () => {
  await import('@/lib/session/session-sweep-action')
})

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/')
})

afterEach(() => {
  flagCookie(null)
})

describe('a page the worker kept: no session, the flag cookie set', () => {
  it('is set right on mount, in place: the session taken, no server render, no reload', async () => {
    flagCookie('login-a-0123456789')
    mount(false)
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(session()).toHaveTextContent('true')
    await settle()
    nothingLoaded()
  })

  it('never loops: each such page is set right the same way, and nothing loads a page', async () => {
    flagCookie('login-a-0123456789')
    for (let load = 0; load < 3; load++) {
      const view = mount(false)
      await settle()
      expect(session()).toHaveTextContent('true')
      view.unmount()
    }
    nothingLoaded()
  })

  it('takes the cookie’s login: another one there later is a switch, read again in place', async () => {
    flagCookie('login-a-0123456789')
    const { client } = mount(false)
    await screen.findByText('سارا احمدی')
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await settle()
    expect(client.getQueryData(CART_KEY)).toEqual({ item_count: 0 })
    flagCookie('login-b-0123456789')
    await act(async () => void window.dispatchEvent(new Event('focus')))
    await settle()
    expect(session()).toHaveTextContent('true')
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    nothingLoaded()
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
    nothingLoaded()
  })
})
