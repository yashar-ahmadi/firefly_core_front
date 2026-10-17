import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionWatch } from '@/features/account/layout/account-session-watch'
import { CART_KEY } from '@/features/cart/cart-cache'
import { pushMark, readPushState, savePushState, stillCurrent } from '@/features/push/push-storage'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The account page's session watch (Plan 3 residual, carried into Plan 4 Task 1):
// 1. a tab first loaded signed in, signed out since, then a login in another tab: it takes the
//    session itself (the server's flag for it never changed, so asking the server again cannot
//    bring it back), and asks the server once, never on every return to the tab;
// 2. coming back to a tab fires both `visibilitychange` and `focus`: one check;
// 3. another login in another tab (a logout, then someone signs in there before this tab is
//    back): the flag cookie holds another session marker than the one this tab's session began
//    with, so what is on screen is the previous visitor's: it goes, and the page loads again.

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

/** The flag cookie as the BFF keeps it: the session's marker, or none. */
function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  window.history.replaceState(null, '', '/account/profile/')
})

afterEach(() => {
  flagCookie(null)
  window.history.replaceState(null, '', '/')
})

/** The session flag, and this tab's own logout and login. */
function Flag() {
  const { hasSession, setHasSession } = useSession()
  return (
    <>
      <output aria-label="session">{String(hasSession)}</output>
      <button type="button" onClick={() => setHasSession(false)}>
        خروج
      </button>
      <button type="button" onClick={() => setHasSession(true)}>
        ورود
      </button>
    </>
  )
}

function renderWatch(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(ME_KEY, { uuid: 'sara-uuid', full_name: 'سارا احمدی' })
  providers.client.setQueryData(SUMMARY_KEY, { wishlist_count: 2 })
  render(
    <>
      <AccountSessionWatch />
      <Flag />
    </>,
    { wrapper: providers.wrapper },
  )
  return providers.client
}

const flag = () => screen.getByRole('status', { name: 'session' })
const focus = () => act(() => void window.dispatchEvent(new Event('focus')))
const shown = () => act(() => void document.dispatchEvent(new Event('visibilitychange')))
const press = (name: string) => act(() => screen.getByRole('button', { name }).click())

describe('AccountSessionWatch: a login in another tab', () => {
  it('first loaded signed in, signed out, then a login elsewhere: takes it, one refresh', () => {
    flagCookie('login-a-0123456789')
    const client = renderWatch(true)
    press('خروج')
    flagCookie(null)
    // The guest's cart, while signed out.
    client.setQueryData(CART_KEY, { item_count: 1 })
    flagCookie('login-b-0123456789')
    focus()
    expect(flag()).toHaveTextContent('true')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    // The guest's cart is read again as the session's.
    expect(client.getQueryData(CART_KEY)).toBeUndefined()
    // Back to the tab again, and again: no more refreshes, no reload.
    shown()
    focus()
    shown()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('a session taken that way is this tab’s: the next return is no account switch', () => {
    renderWatch(false)
    expect(mocks.replace).toHaveBeenCalledTimes(1)
    flagCookie('login-b-0123456789')
    focus()
    expect(flag()).toHaveTextContent('true')
    flagCookie('login-b-0123456789')
    shown()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
  })
})

describe('AccountSessionWatch: one check per return to the tab', () => {
  it('visibilitychange then focus, after the session ended elsewhere: login replaces it once', () => {
    flagCookie('login-a-0123456789')
    renderWatch(true)
    flagCookie(null)
    shown()
    focus()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login/?next=/account/profile/')
  })

  it('nothing changed since the last check: nothing to do', () => {
    flagCookie('login-a-0123456789')
    const client = renderWatch(true)
    // An access-token refresh re-sets the cookie with the same marker.
    flagCookie('login-a-0123456789')
    focus()
    shown()
    expect(client.getQueryData(ME_KEY)).toEqual({ uuid: 'sara-uuid', full_name: 'سارا احمدی' })
    expect(mocks.reloadPage).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})

describe('AccountSessionWatch: another account signed in elsewhere', () => {
  it.each([
    ['a session marker', 'login-a-0123456789'],
    ['the flag of a session from before markers', '1'],
  ])('this tab began with %s: the data goes and the page loads again', (_, before) => {
    flagCookie(before)
    const client = renderWatch(true)
    flagCookie('login-b-0123456789')
    focus()
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
    expect(client.getQueryData(ME_KEY)).toBeUndefined()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
    shown()
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
  })

  it('push steps of this tab stop; the registration is left to the login that replaced it', () => {
    flagCookie('login-a-0123456789')
    renderWatch(true)
    const registration = { token: 'fcm-b', owner: 'other-uuid', checkedAt: 1 }
    savePushState(registration)
    const mark = pushMark()
    flagCookie('login-b-0123456789')
    focus()
    expect(stillCurrent(registration, mark)).toBe(false)
    expect(readPushState()).toEqual(registration)
  })

  it('this tab’s own login over a session ended elsewhere is no switch', () => {
    flagCookie('login-a-0123456789')
    renderWatch(true)
    press('خروج')
    flagCookie('login-b-0123456789')
    press('ورود')
    focus()
    expect(flag()).toHaveTextContent('true')
    expect(mocks.reloadPage).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
