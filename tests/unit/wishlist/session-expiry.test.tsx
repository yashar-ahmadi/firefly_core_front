import { act, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeartButton } from '@/features/wishlist/heart-button'
import { ApiError } from '@/lib/api/errors'
import { useSession } from '@/lib/session/session-context'
import { clientProviders } from '../support/providers'

// The hearts' wishlist ids are a session-only read through the BFF. When it answers 401 because
// the session is gone (expired, revoked, ended in another tab), the page stops acting signed in
// (`useSession().hasSession` turns false, in the same provider the page runs in), and no heart
// mounted afterwards asks again: not the next grid, not a client navigation's (Plan 3, «A 401
// from a session-only BFF call resets hasSession»).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

function SessionFlag() {
  return <p data-testid="session">{String(useSession().hasSession)}</p>
}

/** A page with `hearts` product cards' hearts (ids from `from`). */
function Page({ hearts, from = 1 }: { hearts: number; from?: number }) {
  return (
    <>
      <SessionFlag />
      {Array.from({ length: hearts }, (_, index) => (
        <HeartButton key={from + index} productId={from + index} slug={`p-${from + index}`} />
      ))}
    </>
  )
}

const listReads = () =>
  mocks.bffFetch.mock.calls.filter(([path]) => path === 'product/wishlist/list/')

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  window.history.replaceState(null, '', '/product-category/digital/mobile-phone/')
})

describe('the hearts after a 401 that ends the session', () => {
  it('one read for a grid of hearts; the session ends; hearts mounted later ask nothing', async () => {
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 401, code: 'not_authenticated', detail: 'وارد شوید.' }),
    )
    const { wrapper } = clientProviders({ hasSession: true })
    const { rerender } = render(<Page hearts={3} />, { wrapper })
    await waitFor(() => expect(screen.getByTestId('session')).toHaveTextContent('false'))
    expect(listReads()).toHaveLength(1)

    // The next grid of the same page, then a client navigation's grid: same provider, no read.
    rerender(<Page hearts={6} />)
    await act(async () => {})
    rerender(<Page hearts={4} from={100} />)
    await act(async () => {})
    expect(listReads()).toHaveLength(1)
    // A background read on a catalog page: it turns into its guest version, nobody asked to
    // log in.
    expect(mocks.push).not.toHaveBeenCalled()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(screen.getAllByRole('button', { name: /علاقه/ })).toHaveLength(4)
    for (const heart of screen.getAllByRole('button', { name: /علاقه/ })) {
      expect(heart).toHaveAttribute('aria-pressed', 'false')
    }
  })
})
