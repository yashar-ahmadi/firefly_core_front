import { act, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SessionCheck } from '@/lib/session/session-check'
import { useSession } from '@/lib/session/session-context'
import { ME_KEY, SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The account guard may send a visitor to login during a client navigation (the session ended
// in another tab, then a link here): the root layout is not rendered again, so the tab still
// thinks it is signed in. The auth pages pass the server's view of the session; it wins once.

const mocks = vi.hoisted(() => ({ replace: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks }))

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/login/?next=%2Faccount%2Fwallet%2F')
})

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
  it('ends a session the server no longer has: no session, her data dropped, no navigation', () => {
    const { client } = renderCheck(false, true)
    expect(flag()).toHaveTextContent('false')
    expect(client.getQueryData(ME_KEY)).toBeNull()
    expect(client.getQueryData(SUMMARY_KEY)).toBeUndefined()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('leaves a session the server has, and a guest, as they are', () => {
    const signedIn = renderCheck(true, true)
    expect(flag()).toHaveTextContent('true')
    expect(signedIn.client.getQueryData(ME_KEY)).toEqual({ full_name: 'سارا احمدی' })
    signedIn.unmount()
    renderCheck(false, false)
    expect(flag()).toHaveTextContent('false')
  })

  it('acts on the server’s value only: a login on the page keeps its session', () => {
    renderCheck(false, false)
    act(() => screen.getByRole('button', { name: 'ورود' }).click())
    expect(flag()).toHaveTextContent('true')
  })
})
