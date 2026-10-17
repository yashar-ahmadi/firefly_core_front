import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionWatch } from '@/features/account/layout/account-session-watch'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// An account page that comes back after its session ended: restored by Back (Next reuses the
// page it cached, and neither the proxy nor the layout runs), or left open in another tab while
// the session ended there. Every session query is off then, so without this the page would keep
// its skeletons (or the other visitor's data) forever.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  const refresh = vi.fn()
  return { replace, refresh, router: { replace, refresh, push: vi.fn() } }
})
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

function flagCookie(present: boolean) {
  document.cookie = present ? 'ff_auth=1; path=/' : 'ff_auth=; max-age=0; path=/'
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/account/addresses/?page=2')
})

afterEach(() => {
  flagCookie(false)
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

function renderWatch(hasSession: boolean) {
  const providers = clientProviders({ hasSession })
  providers.client.setQueryData(ME_KEY, { full_name: 'سارا احمدی' })
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

const LOGIN = '/login/?next=/account/addresses/%3Fpage%3D2'
const flag = () => screen.getByRole('status', { name: 'session' })

describe('AccountSessionWatch', () => {
  it('a page restored after the session ended here (no session, no cookie): login replaces it', () => {
    renderWatch(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('no session in this tab but the cookie is back (a login elsewhere): it takes the session', () => {
    flagCookie(true)
    renderWatch(false)
    // Signed in here at once (the server's own flag may never change), and the server asked
    // once to render its part again (account-session-switch.test.tsx: never more than once).
    expect(flag()).toHaveTextContent('true')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('a live session is left as it is, on mount and when the tab comes back', () => {
    flagCookie(true)
    const client = renderWatch(true)
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(flag()).toHaveTextContent('true')
    expect(client.getQueryData(ME_KEY)).toEqual({ full_name: 'سارا احمدی' })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it.each([
    ['focus', () => window.dispatchEvent(new Event('focus'))],
    ['visibilitychange', () => document.dispatchEvent(new Event('visibilitychange'))],
    [
      'a page shown again from the browser’s cache',
      () => window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: true })),
    ],
  ])('the session ended in another tab, then %s: it ends here, data dropped, login', (_, show) => {
    flagCookie(true)
    const client = renderWatch(true)
    flagCookie(false)
    act(show)
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN)
  })

  it('a first page load (not from the cache) is no reason to check again', () => {
    flagCookie(true)
    renderWatch(true)
    flagCookie(false)
    act(() => {
      window.dispatchEvent(new PageTransitionEvent('pageshow', { persisted: false }))
    })
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('a hidden tab does not check (only coming back does)', () => {
    flagCookie(true)
    renderWatch(true)
    flagCookie(false)
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    try {
      act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      expect(mocks.replace).not.toHaveBeenCalled()
    } finally {
      visibility.mockRestore()
    }
  })

  it('a logout on the page is left to it (it goes home): the flag turning off is no check', () => {
    flagCookie(true)
    renderWatch(true)
    flagCookie(false)
    act(() => screen.getByRole('button', { name: 'خروج' }).click())
    expect(flag()).toHaveTextContent('false')
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.refresh).not.toHaveBeenCalled()
  })
})
