import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { SessionProvider, useSession, type SessionState } from '@/lib/session/session-context'

// The session marker a tab remembers (the flag cookie's value, `ff_auth`): the one it loaded
// with, the one its own login or adoption took, and the one there when a server render turns
// the session on (`router.refresh()`), so a login elsewhere after that is still noticed.

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

afterEach(() => flagCookie(null))

function renderProvider(initialHasSession: boolean) {
  const state: { current: SessionState | null } = { current: null }
  function Probe() {
    state.current = useSession()
    return null
  }
  const view = render(
    <SessionProvider initialHasSession={initialHasSession}>
      <Probe />
    </SessionProvider>,
  )
  const serverSays = (next: boolean) =>
    view.rerender(
      <SessionProvider initialHasSession={next}>
        <Probe />
      </SessionProvider>,
    )
  return { session: () => state.current!, serverSays }
}

describe('the session marker', () => {
  it('is the one the tab loaded with', () => {
    flagCookie('login-a-0123456789')
    const { session } = renderProvider(true)
    expect(session().sessionReplaced()).toBe(false)
    flagCookie('login-b-0123456789')
    expect(session().sessionReplaced()).toBe(true)
  })

  it('is read when a server render turns the session on: a later login elsewhere is noticed', () => {
    const { session, serverSays } = renderProvider(false)
    flagCookie('login-a-0123456789')
    serverSays(true)
    expect(session().hasSession).toBe(true)
    flagCookie('login-b-0123456789')
    expect(session().sessionReplaced()).toBe(true)
  })

  it('a session this tab took itself keeps its marker when the server agrees later', () => {
    const { session, serverSays } = renderProvider(false)
    flagCookie('login-a-0123456789')
    act(() => session().setHasSession(true))
    // Another login elsewhere before the server's render came back.
    flagCookie('login-b-0123456789')
    serverSays(true)
    expect(session().sessionReplaced()).toBe(true)
  })

  it('is forgotten with the session', () => {
    flagCookie('login-a-0123456789')
    const { session } = renderProvider(true)
    act(() => session().setHasSession(false))
    expect(session().sessionReplaced()).toBe(false)
  })
})
