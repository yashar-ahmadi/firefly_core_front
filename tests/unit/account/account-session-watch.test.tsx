import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountSessionWatch } from '@/features/account/layout/account-session-watch'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// An account page that comes back after its session ended: restored by Back (Next reuses the
// page it cached, and neither the proxy nor the layout runs). Every session query is off once
// the tab has no session, so without this the page would keep its skeletons (or the other
// visitor's data) forever. The watch checks once, when the page mounts; a tab coming back is the
// shop-wide sweep's (session-switch-sweep.test.tsx, account-session-switch.test.tsx).

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
  window.history.replaceState(null, '', '/account/addresses/?page=2')
})

afterEach(() => {
  flagCookie(null)
  window.history.replaceState(null, '', '/')
})

function Flag() {
  const { hasSession } = useSession()
  return <output aria-label="session">{String(hasSession)}</output>
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

describe('AccountSessionWatch (when an account page mounts)', () => {
  it('no session and no cookie (a logout or a session end here, then Back): login replaces it', () => {
    renderWatch(false)
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN)
    expect(mocks.refresh).not.toHaveBeenCalled()
  })

  it('no session but the cookie (a login elsewhere, then Back): it takes the session, one refresh', () => {
    flagCookie('login-b-0123456789')
    renderWatch(false)
    expect(flag()).toHaveTextContent('true')
    expect(mocks.refresh).toHaveBeenCalledTimes(1)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('a session but no cookie (it ended elsewhere): it ends here, data dropped, login', () => {
    const client = renderWatch(true)
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN)
  })

  it('a live session is left as it is', () => {
    flagCookie('login-a-0123456789')
    const client = renderWatch(true)
    expect(flag()).toHaveTextContent('true')
    expect(client.getQueryData(ME_KEY)).toEqual({ full_name: 'سارا احمدی' })
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.reloadPage).not.toHaveBeenCalled()
  })

  it('listens to nothing itself: a tab coming back is the shop-wide sweep’s', () => {
    flagCookie('login-a-0123456789')
    renderWatch(true)
    flagCookie(null)
    act(() => {
      window.dispatchEvent(new Event('focus'))
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(flag()).toHaveTextContent('true')
    expect(mocks.replace).not.toHaveBeenCalled()
  })
})
