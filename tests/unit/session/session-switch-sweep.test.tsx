import { useQuery } from '@tanstack/react-query'
import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { pushMark, readPushState, savePushState, stillCurrent } from '@/features/push/push-storage'
import { useSession } from '@/lib/session/session-context'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The shop-wide session sweep (Plan 4 Task 1 fix round 1): a tab coming back (focus, shown
// again, restored from the browser's cache) checks the session flag cookie, whatever the page.
// On a catalog page (the cart's too) another login in another tab reads the visitor's data
// again in place (the HTML is the same for everyone: no reload); a session that ended there
// turns the page into its guest version; a login there is taken.

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

const profile = vi.hoisted(() => ({ name: 'سارا احمدی' }))
const WISHLIST_IDS = ['wishlist', 'ids']

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  profile.name = 'سارا احمدی'
  window.history.replaceState(null, '', '/product-category/digital/')
})

afterEach(() => {
  flagCookie(null)
  window.history.replaceState(null, '', '/')
})

/** The header's name, read with the session (as `useMe`). */
function HeaderName() {
  const { hasSession, setHasSession } = useSession()
  const me = useQuery({
    queryKey: ME_KEY,
    queryFn: async () => ({ full_name: profile.name }),
    enabled: hasSession,
  })
  return (
    <>
      <output aria-label="session">{String(hasSession)}</output>
      <output aria-label="name">{me.data?.full_name ?? ''}</output>
      <button type="button" onClick={() => setHasSession(false)}>
        خروج
      </button>
      <button type="button" onClick={() => setHasSession(true)}>
        ورود
      </button>
    </>
  )
}

function renderSweep(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(CART_KEY, { item_count: 1 })
  providers.client.setQueryData(WISHLIST_IDS, [1, 2])
  render(
    <>
      <SessionSwitchSweep />
      <HeaderName />
    </>,
    { wrapper: providers.wrapper },
  )
  return providers.client
}

const output = (name: string) => screen.getByRole('status', { name })
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

describe('SessionSwitchSweep on a catalog page', () => {
  it('another login elsewhere: the visitor’s data is read again in place, no reload', async () => {
    flagCookie('login-a-0123456789')
    const client = renderSweep(true)
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    const registration = { token: 'fcm-b', owner: 'kamran-uuid', checkedAt: 1 }
    savePushState(registration)
    const mark = pushMark()
    profile.name = 'کامران یزدی'
    flagCookie('login-b-0123456789')
    await focus()
    expect(await screen.findByText('کامران یزدی')).toBeInTheDocument()
    expect(output('session')).toHaveTextContent('true')
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    expect(client.getQueryData(WISHLIST_IDS)).toBeUndefined()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
    // This tab's push steps stop; the stored registration is the new login's to keep.
    expect(stillCurrent(registration, mark)).toBe(false)
    expect(readPushState()).toEqual(registration)
    // The new login is this tab's now: coming back again changes nothing.
    profile.name = 'دیگری'
    await shown()
    await focus()
    expect(screen.getByRole('status', { name: 'name' })).toHaveTextContent('کامران یزدی')
  })

  it('the session ended elsewhere: the guest version of the page, no navigation', async () => {
    flagCookie('login-a-0123456789')
    const client = renderSweep(true)
    await screen.findByText('سارا احمدی')
    flagCookie(null)
    await shown()
    await focus()
    expect(output('session')).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('a login elsewhere while this tab is a guest: taken, with one server render', async () => {
    // A guest's checkout receiver kept in the tab: the guest's, not the account's.
    sessionStorage.setItem('ff-checkout-receiver', '{"values":{},"confirmed":true}')
    const client = renderSweep(false)
    flagCookie('login-b-0123456789')
    await focus()
    expect(output('session')).toHaveTextContent('true')
    expect(sessionStorage.getItem('ff-checkout-receiver')).toBeNull()
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    await shown()
    await focus()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })

  it('a login elsewhere while this tab is a guest: the header’s name and the hearts are read', async () => {
    const hearts = vi.fn(async () => [7])
    function Hearts() {
      const { hasSession } = useSession()
      const ids = useQuery({ queryKey: WISHLIST_IDS, queryFn: hearts, enabled: hasSession })
      return <output aria-label="hearts">{ids.data?.join(',') ?? ''}</output>
    }
    const providers = clientProviders({ hasSession: false })
    render(
      <>
        <SessionSwitchSweep />
        <HeaderName />
        <Hearts />
      </>,
      { wrapper: providers.wrapper },
    )
    expect(output('name')).toHaveTextContent('')
    expect(hearts).not.toHaveBeenCalled()
    flagCookie('login-b-0123456789')
    await focus()
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(output('hearts')).toHaveTextContent('7')
    expect(hearts).toHaveBeenCalledTimes(1)
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('checks nothing on mount, nor while the tab is hidden; a page from the browser’s cache does', async () => {
    flagCookie('login-a-0123456789')
    renderSweep(false)
    // Rendered for what the cookie held then: nothing to set right.
    expect(output('session')).toHaveTextContent('false')
    flagCookie('login-b-0123456789')
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      await shown()
      expect(output('session')).toHaveTextContent('false')
    } finally {
      visibility.mockRestore()
    }
    act(() => void window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })))
    await settle()
    expect(output('session')).toHaveTextContent('true')
  })

  it('this tab’s own logout and login are no switch', async () => {
    flagCookie('login-a-0123456789')
    renderSweep(true)
    await screen.findByText('سارا احمدی')
    act(() => screen.getByRole('button', { name: 'خروج' }).click())
    flagCookie('login-b-0123456789')
    act(() => screen.getByRole('button', { name: 'ورود' }).click())
    await focus()
    expect(output('session')).toHaveTextContent('true')
    expect(mocks.refresh).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })
})
