import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionCheck } from '@/lib/session/session-check'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The account guard may send a visitor to login during a client navigation (the session ended
// in another tab, then a link here): the root layout is not rendered again, so the tab still
// thinks it is signed in. The auth pages check, when they mount or render again, whether the
// session flag cookie (`ff_auth`, readable by scripts, alive exactly as long as the session) is
// still there. The server's value passed down only triggers the check: on a back/forward visit
// Next replays an old render of the layout, so it may be stale.

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))

/** Sets (or deletes) the session flag cookie the BFF and the proxy keep beside the tokens. */
function flagCookie(present: boolean) {
  document.cookie = present ? 'ff_auth=1; path=/' : 'ff_auth=; max-age=0; path=/'
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/login/?next=%2Faccount%2Fwallet%2F')
})

afterEach(() => flagCookie(false))

/** The session flag, and a login on the page (the flow turns the flag on). */
function Flag() {
  const { hasSession, setHasSession } = useSession()
  return (
    <>
      <output aria-label="session">{String(hasSession)}</output>
      <button type="button" onClick={() => setHasSession(true)}>
        ورود
      </button>
    </>
  )
}

function renderCheck(onServer: boolean, inTab: boolean) {
  const providers = clientProviders({ hasSession: inTab })
  providers.client.setQueryData(ME_KEY, { full_name: 'سارا احمدی' })
  providers.client.setQueryData(SUMMARY_KEY, { wishlist_count: 2 })
  const view = render(
    <>
      <SessionCheck hasSession={onServer} />
      <Flag />
    </>,
    { wrapper: providers.wrapper },
  )
  return { ...view, client: providers.client }
}

const flag = () => screen.getByRole('status', { name: 'session' })

describe('SessionCheck', () => {
  it('ends a session that is gone (no flag cookie): no session, her data dropped, no navigation', () => {
    const { client } = renderCheck(false, true)
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('keeps a live session when a back/forward visit replays an old «no session» render', () => {
    // A guest's login page, then a login, then Back: the layout's old payload says false.
    flagCookie(true)
    const { client } = renderCheck(false, true)
    expect(flag()).toHaveTextContent('true')
    expect(client.getQueryData(ME_KEY)).toEqual({ full_name: 'سارا احمدی' })
    expect(client.getQueryData(SUMMARY_KEY)).toEqual({ wishlist_count: 2 })
  })

  it('ends a session the cookie says is gone, whatever an old render says', () => {
    const { client } = renderCheck(true, true)
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
  })

  it('leaves a live session, and a guest, as they are', () => {
    flagCookie(true)
    const signedIn = renderCheck(true, true)
    expect(flag()).toHaveTextContent('true')
    expect(signedIn.client.getQueryData(ME_KEY)).toEqual({ full_name: 'سارا احمدی' })
    signedIn.unmount()
    flagCookie(false)
    renderCheck(false, false)
    expect(flag()).toHaveTextContent('false')
  })

  it('checks on its own render only: a login on the page keeps its session', () => {
    renderCheck(false, false)
    act(() => screen.getByRole('button', { name: 'ورود' }).click())
    expect(flag()).toHaveTextContent('true')
  })

  it('checks again when the server renders the layout again', () => {
    flagCookie(true)
    const { rerender, client } = renderCheck(true, true)
    expect(flag()).toHaveTextContent('true')
    flagCookie(false)
    rerender(
      <>
        <SessionCheck hasSession={false} />
        <Flag />
      </>,
    )
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
  })
})
