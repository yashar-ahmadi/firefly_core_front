import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CommentList } from '@/features/product/components/reviews/comment-list'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'
import { clientProviders } from '../support/providers'
import { comment, commentPage } from './comment-fixtures'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const SLUG = 'samsung-galaxy-s25-ultra'
const PATH = `product/detail/${SLUG}/comment/list/`

vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

function renderListWithClient(count: number, type: 'comment' | 'question' = 'comment') {
  const { client, wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  return { ...render(<CommentList slug={SLUG} type={type} count={count} />, { wrapper }), client }
}

const renderList = (count: number, type: 'comment' | 'question' = 'comment') =>
  renderListWithClient(count, type)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  resetIntersections()
})

describe('CommentList', () => {
  it('loads nothing until the section comes into view, then the first page of its type', async () => {
    mocks.bffFetch.mockResolvedValue({ data: commentPage([comment()]), msg: '', status: 200 })
    renderList(3)
    expect(mocks.bffFetch).not.toHaveBeenCalled()
    expect(screen.getByLabelText('در حال بارگذاری دیدگاه\u{200C}ها')).toHaveAttribute(
      'aria-busy',
      'true',
    )
    act(() => intersect())
    expect(await screen.findByText('محمد رضایی')).toBeInTheDocument()
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      query: { comment_type: 'comment', page: 1 },
      signal: expect.any(AbortSignal),
    })
  })

  // comment_count counts replies too (product digest §9): one root with two replies is «3».
  it('lists the root threads whatever the count adds for their replies', async () => {
    mocks.bffFetch.mockResolvedValue({ data: commentPage([comment()]), msg: '', status: 200 })
    renderList(3)
    // Placeholders while it loads: never more than three, whatever the count.
    expect(
      screen.getByLabelText('در حال بارگذاری دیدگاه\u{200C}ها').children.length,
    ).toBeLessThanOrEqual(3)
    act(() => intersect())
    const list = await screen.findByRole('list', { name: 'دیدگاه\u{200C}ها' })
    expect(within(list).getAllByRole('article').length).toBeGreaterThanOrEqual(1)
    expect(screen.queryByText(/هنوز دیدگاهی/)).toBeNull()
    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull()
  })

  it('asks for nothing when there is nothing to list', () => {
    renderList(0, 'question')
    act(() => intersect())
    expect(screen.getByText('هنوز پرسشی ثبت نشده است.')).toBeInTheDocument()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('shows more on request, page by page', async () => {
    const user = userEvent.setup()
    mocks.bffFetch
      .mockResolvedValueOnce({ data: commentPage([comment()], 1, 2), msg: '', status: 200 })
      .mockResolvedValueOnce({
        data: commentPage([comment({ id: 10001, name: 'سارا احمدی' })], 2, 2),
        msg: '',
        status: 200,
      })
    renderList(21)
    act(() => intersect())
    const more = await screen.findByRole('button', { name: 'نمایش بیشتر' })
    await user.click(more)
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(mocks.bffFetch).toHaveBeenLastCalledWith(PATH, {
      query: { comment_type: 'comment', page: 2 },
      signal: expect.any(AbortSignal),
    })
    const list = screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    const articles = within(list).getAllByRole('article')
    expect(articles).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull()
    // The button is gone (last page): the focus moves to the first new entry, not to <body>.
    await waitFor(() => expect(articles[1]).toHaveFocus())
  })

  it('forgets the focus it owed when the next page adds nothing', async () => {
    const user = userEvent.setup()
    mocks.bffFetch
      .mockResolvedValueOnce({ data: commentPage([comment()], 1, 2), msg: '', status: 200 })
      // The list shrank meanwhile: page 2 is empty.
      .mockResolvedValueOnce({ data: commentPage([], 2, 2), msg: '', status: 200 })
    const { client } = renderListWithClient(21)
    act(() => intersect())
    const more = await screen.findByRole('button', { name: 'نمایش بیشتر' })
    await user.click(more)
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull())
    // Later the list grows (a refresh): the new entry must not take the focus then.
    mocks.bffFetch
      .mockResolvedValueOnce({
        data: commentPage([comment(), comment({ id: 10001, name: 'سارا احمدی' })], 1, 1),
        msg: '',
        status: 200,
      })
      .mockResolvedValue({ data: commentPage([], 2, 1), msg: '', status: 200 })
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await act(() => client.invalidateQueries())
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(outside).toHaveFocus()
    outside.remove()
  })

  it('keeps the loaded entries when the next page fails, with a retry beside the button', async () => {
    const user = userEvent.setup()
    mocks.bffFetch
      .mockResolvedValueOnce({ data: commentPage([comment()], 1, 2), msg: '', status: 200 })
      .mockRejectedValueOnce(new ApiError({ status: 429, code: 'throttled' }))
      .mockResolvedValueOnce({
        data: commentPage([comment({ id: 10001, name: 'سارا احمدی' })], 2, 2),
        msg: '',
        status: 200,
      })
    renderList(21)
    act(() => intersect())
    await user.click(await screen.findByRole('button', { name: 'نمایش بیشتر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('ادامه\u{0654} فهرست بارگذاری نشد.')
    // The first page stays, and no full-list error replaces it.
    expect(screen.getByText('محمد رضایی')).toBeInTheDocument()
    expect(screen.queryByText('دیدگاه\u{200C}ها بارگذاری نشد.')).toBeNull()
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(await screen.findByText('سارا احمدی')).toBeInTheDocument()
    expect(screen.getByText('محمد رضایی')).toBeInTheDocument()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('says when the list cannot be loaded, and tries again', async () => {
    const user = userEvent.setup()
    mocks.bffFetch
      .mockRejectedValueOnce(new ApiError({ status: 404, code: 'not_found' }))
      .mockResolvedValueOnce({ data: commentPage([comment()]), msg: '', status: 200 })
    renderList(3)
    act(() => intersect())
    const retry = await screen.findByRole('button', { name: 'تلاش دوباره' })
    expect(screen.getByText('دیدگاه\u{200C}ها بارگذاری نشد.')).toBeInTheDocument()
    await user.click(retry)
    await waitFor(() => expect(screen.getByText('محمد رضایی')).toBeInTheDocument())
  })
})
