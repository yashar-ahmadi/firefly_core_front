import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentList } from '@/features/product/components/reviews/comment-list'
import { FeatureProvider } from '@/features/settings/feature-context'
import type { Paginated } from '@/lib/api/types/common'
import type { ProductComment } from '@/lib/api/types/catalog'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'
import { clientProviders } from '../support/providers'
import { comment, commentPage } from './comment-fixtures'

// Page 1 rendered on the server (spec §8.13) and handed to the list as `initialPage`.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const SLUG = 'samsung-galaxy-s25-ultra'
const PATH = `product/detail/${SLUG}/comment/list/`

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

function renderSeeded(initialPage: Paginated<ProductComment>, hasSession = false) {
  const { wrapper: Base } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  return render(
    <CommentList slug={SLUG} type="comment" count={initialPage.count} initialPage={initialPage} />,
    { wrapper },
  )
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  resetIntersections()
})

describe('CommentList seeded with the server page', () => {
  it('shows page 1 at once and asks nothing for a guest, even in view', async () => {
    renderSeeded(commentPage([comment()]))
    expect(screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })).toBeInTheDocument()
    expect(screen.getByText('محمد رضایی')).toBeInTheDocument()
    act(() => intersect())
    await act(async () => {})
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('loads later pages through the BFF with «نمایش بیشتر»', async () => {
    mocks.bffFetch.mockResolvedValue({
      data: commentPage([comment({ id: 9001, name: 'سارا احمدی' })], 2, 2),
      msg: '',
      status: 200,
    })
    renderSeeded({ ...commentPage([comment()], 1, 2), count: 2 })
    act(() => intersect())
    await userEvent.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      query: { comment_type: 'comment', page: 2 },
      signal: expect.any(AbortSignal),
    })
  })

  it('fetches page 1 again through the BFF for a signed-in visitor, marking their own', async () => {
    mocks.bffFetch.mockResolvedValue({
      data: commentPage([comment({ is_current_user: true })]),
      msg: '',
      status: 200,
    })
    renderSeeded(commentPage([comment()]), true)
    const list = screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    expect(within(list).queryByText('شما')).toBeNull()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    act(() => intersect())
    expect(await within(list).findByText('شما')).toBeInTheDocument()
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      query: { comment_type: 'comment', page: 1 },
      signal: expect.any(AbortSignal),
    })
    // Once: a second sighting asks nothing more.
    act(() => intersect())
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(1))
  })
})
