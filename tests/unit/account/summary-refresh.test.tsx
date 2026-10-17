import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewForm } from '@/features/product/components/reviews/review-form'
import { FeatureProvider } from '@/features/settings/feature-context'
import { toggleWishlistOnce, useToggleWishlist } from '@/features/wishlist/hooks'
import { ApiError } from '@/lib/api/errors'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'
import { ok, page, summary } from './fixtures'

// Plan 3: the account's badges come from `dashboard/summary/`, so a write that changes one of
// its counters reads it again: a wishlist toggle (`wishlist_count`), a review or a question sent
// (`comment_count`). The reading list (Plan 5) and orders and payments (Plan 4) will join.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }) }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

/** A cache holding the summary the account pages showed. */
function signedIn() {
  const providers = clientProviders({ hasSession: true })
  providers.client.setQueryData(SUMMARY_KEY, summary())
  return providers
}

const summaryStale = (client: ReturnType<typeof signedIn>['client']) =>
  client.getQueryState(SUMMARY_KEY)?.isInvalidated

describe('a wishlist toggle', () => {
  function routeToggle(write: () => Promise<unknown>) {
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'product/wishlist/list/' ? Promise.resolve(ok(page([]))) : write(),
    )
  }

  it('reads the summary again once the last toggle has settled', async () => {
    let answer: (value: unknown) => void = () => {}
    routeToggle(() => new Promise((resolve) => (answer = resolve)))
    const { client, wrapper } = signedIn()
    const { result } = renderHook(() => useToggleWishlist(), { wrapper })
    act(() => result.current.toggle({ id: 2, slug: 'product-2' }))
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalled())
    expect(summaryStale(client)).toBe(false)
    await act(async () => answer({ data: { is_in_wishlist: true }, msg: '', status: 201 }))
    await waitFor(() => expect(summaryStale(client)).toBe(true))
  })

  it('also when a card toggles without a hook (toggleWishlistOnce)', async () => {
    routeToggle(() => Promise.resolve({ data: null, msg: '', status: 204 }))
    const { client } = signedIn()
    const viewer = { hasSession: true, router: { push: vi.fn() }, expire: vi.fn() }
    await toggleWishlistOnce(client, viewer, { id: 2, slug: 'product-2' })
    await waitFor(() => expect(summaryStale(client)).toBe(true))
  })
})

describe('a review or a question sent', () => {
  function renderReview(client: ReturnType<typeof signedIn>) {
    const Base = client.wrapper
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <FeatureProvider initial={{}}>{children}</FeatureProvider>
      </Base>
    )
    const onDone = vi.fn()
    render(<ReviewForm slug="samsung-galaxy-s25-ultra" onDone={onDone} />, { wrapper })
    return { user: userEvent.setup(), onDone }
  }

  it('reads the summary again once the API took it', async () => {
    mocks.bffFetch.mockResolvedValue(ok({}))
    const providers = signedIn()
    const { user, onDone } = renderReview(providers)
    await user.type(screen.getByRole('textbox', { name: /^متن دیدگاه/ }), 'گوشی خوبی است')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    await waitFor(() => expect(onDone).toHaveBeenCalled())
    expect(summaryStale(providers.client)).toBe(true)
  })

  it('leaves it as it is when the API refused it', async () => {
    mocks.bffFetch.mockRejectedValue(
      new ApiError({ status: 400, errors: [{ code: 'invalid', attr: 'review', detail: 'کوتاه' }] }),
    )
    const providers = signedIn()
    const { user } = renderReview(providers)
    await user.type(screen.getByRole('textbox', { name: /^متن دیدگاه/ }), 'خوب')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    await waitFor(() =>
      expect(screen.getByRole('textbox', { name: /^متن دیدگاه/ })).toHaveAttribute(
        'aria-invalid',
        'true',
      ),
    )
    expect(summaryStale(providers.client)).toBe(false)
  })
})
