import { act, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SessionSwitchSweep } from '@/lib/session/session-switch-sweep'
import { clientProviders } from '../support/providers'

// The shop-wide sweep loads what it does on demand (session-sweep-action). When that code cannot
// be downloaded (a stale chunk after a deploy, a dropped connection), the page reloads instead,
// once: the server's render is the truth about the session (src/lib/session/session-switch-sweep.tsx).

const mocks = vi.hoisted(() => ({
  reloadPage: vi.fn(),
  router: { replace: vi.fn(), refresh: vi.fn(), push: vi.fn() },
}))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  reloadPage: mocks.reloadPage,
  loadPage: vi.fn(),
}))
vi.mock('@/lib/session/session-sweep-action', () => {
  throw new Error('Loading chunk session-sweep-action failed')
})

function flagCookie(marker: string | null) {
  document.cookie = marker === null ? 'ff_auth=; max-age=0; path=/' : `ff_auth=${marker}; path=/`
}

afterEach(() => flagCookie(null))

const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 20)))
async function focus() {
  act(() => void window.dispatchEvent(new Event('focus')))
  await settle()
}

describe('SessionSwitchSweep when its action’s code cannot load', () => {
  it('reloads the page once, and never again for the same finding', async () => {
    flagCookie('login-a-0123456789')
    const { wrapper } = clientProviders({ hasSession: true })
    const { rerender } = render(<SessionSwitchSweep />, { wrapper })
    flagCookie('login-b-0123456789')
    await focus()
    await vi.waitFor(() => expect(mocks.reloadPage).toHaveBeenCalledTimes(1))
    // Coming back again finds the cookie it reconciled; a render does not run it again.
    await focus()
    document.dispatchEvent(new Event('visibilitychange'))
    rerender(<SessionSwitchSweep />)
    await settle()
    expect(mocks.reloadPage).toHaveBeenCalledTimes(1)
    expect(mocks.router.refresh).not.toHaveBeenCalled()
    expect(mocks.router.replace).not.toHaveBeenCalled()
  })
})
