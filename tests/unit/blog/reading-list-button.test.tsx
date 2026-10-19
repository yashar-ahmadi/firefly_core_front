import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ReadingListButton } from '@/features/blog/components/reading-list-button'
import { ReadingListScope } from '@/features/blog/components/reading-list-scope'
import { READING_LIST_IDS_KEY } from '@/features/blog/reading-list'
import { notify } from '@/components/ui/toaster'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { createQueryClient } from '@/lib/query/query-client'
import { SUMMARY_KEY } from '@/lib/session/viewer-queries'
import { clientProviders } from '../support/providers'

// The bookmark on a post card (blog digest §1.8): a guest goes to login; with a session it is
// pressed for a saved post, flips at once on a press (one request: POST saves, DELETE answers 204),
// flips back with the API's message on a failure, ends the session on a 401, and has the account
// badge (`SUMMARY_KEY`) read again.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))

const SAVE = 'افزودن به لیست مطالعه'
const REMOVE = 'حذف از لیست مطالعه'
const SAVED_MSG = 'مطلب به لیست مطالعه اضافه شد.'
const POST = { id: 10001, slug: 'best-phones-under-30m' }

function savedList(ids: number[]) {
  const results = ids.map((id) => ({ id, slug: `post-${id}` }))
  const data = { count: ids.length, total_pages: 1, current_page: 1, page_size: 100 }
  return { data: { ...data, next: null, previous: null, results }, msg: '', status: 200 }
}

const writes = () => mocks.bffFetch.mock.calls.filter(([, opts]) => opts?.method)

function renderButton({ hasSession = true, onFeatureDisabled = vi.fn(), blogOn = true } = {}) {
  const client = createQueryClient({ onFeatureDisabled })
  const { wrapper: Session } = clientProviders({ hasSession, client })
  const features = blogOn
    ? {}
    : { blog: { key: 'blog' as const, name: 'وبلاگ', enabled: false, reason: null } }
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Session>
      <FeatureProvider initial={features}>{children}</FeatureProvider>
    </Session>
  )
  render(
    <ReadingListScope>
      <h3 id="title">بهترین گوشی‌ها</h3>
      <ReadingListButton post={POST} describedBy="title" />
    </ReadingListScope>,
    { wrapper },
  )
  return { client, onFeatureDisabled }
}

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.replace.mockReset()
  vi.mocked(notify.error).mockReset()
  vi.mocked(notify.success).mockReset()
})

afterEach(() => vi.restoreAllMocks())

describe('ReadingListButton', () => {
  it('a guest sees it and is sent to login on a press; nothing is asked of the API', async () => {
    renderButton({ hasSession: false })
    const button = screen.getByRole('button', { name: SAVE })
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await userEvent.click(button)
    expect(mocks.push).toHaveBeenCalledWith('/login/')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('is not there while the shell’s feature map has the blog off (guest or signed in)', () => {
    mocks.bffFetch.mockResolvedValue(savedList([10001]))
    renderButton({ blogOn: false })
    expect(screen.queryByRole('button')).toBeNull()
    renderButton({ hasSession: false, blogOn: false })
    expect(screen.queryByRole('button')).toBeNull()
    expect(screen.getAllByRole('heading', { name: 'بهترین گوشی‌ها' })).toHaveLength(2)
  })

  it('ignores a press while a signed-in visitor’s ids load (it cannot know which way to go)', async () => {
    mocks.bffFetch.mockReturnValue(new Promise(() => {}))
    renderButton()
    const button = screen.getByRole('button', { name: SAVE })
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(writes()).toEqual([])
    expect(mocks.push).not.toHaveBeenCalled()
  })

  it('signed in: the saved ids are read once (every page, 100 a time), and a saved post is pressed', async () => {
    mocks.bffFetch.mockResolvedValue(savedList([10001]))
    renderButton()
    const button = await screen.findByRole('button', { name: REMOVE })
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAccessibleDescription('بهترین گوشی‌ها')
    expect(mocks.bffFetch).toHaveBeenCalledExactlyOnceWith('blog/reading-list/list/', {
      query: { limit: 100, page: 1 },
      signal: expect.any(AbortSignal),
    })
  })

  it('a press saves at once (optimistic), with one POST, the API’s message and the badge stale', async () => {
    let answer: (value: unknown) => void = () => {}
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) => {
      if (!opts.method) return Promise.resolve(savedList([]))
      return new Promise((resolve) => (answer = resolve))
    })
    const { client } = renderButton()
    client.setQueryData(SUMMARY_KEY, { reading_list_count: 0 })
    const button = await screen.findByRole('button', { name: SAVE })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))

    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'true')
    expect(button).toHaveAccessibleName(REMOVE)
    // Pressed again while the first is on its way: still one request.
    await userEvent.click(button)
    expect(writes()).toEqual([
      ['blog/post/best-phones-under-30m/reading-list/', { method: 'POST' }],
    ])

    answer({ data: { is_in_reading_list: true }, msg: SAVED_MSG, status: 201 })
    await waitFor(() => expect(notify.success).toHaveBeenCalledWith(SAVED_MSG))
    expect(button).toHaveAttribute('aria-pressed', 'true')
    await waitFor(() => expect(client.getQueryState(SUMMARY_KEY)?.isInvalidated).toBe(true))
    // The ids are not read again: the answer says it all (one request per press).
    expect(mocks.bffFetch.mock.calls.filter(([, opts]) => !opts?.method)).toHaveLength(1)
  })

  it('a press on a saved post removes it with one DELETE (204, no body)', async () => {
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) =>
      Promise.resolve(opts.method ? { data: null, msg: '', status: 204 } : savedList([10001])),
    )
    const { client } = renderButton()
    const button = await screen.findByRole('button', { name: REMOVE })
    await userEvent.click(button)
    expect(button).toHaveAttribute('aria-pressed', 'false')
    await waitFor(() => expect(writes()).toHaveLength(1))
    expect(writes()[0]).toEqual([
      'blog/post/best-phones-under-30m/reading-list/',
      { method: 'DELETE' },
    ])
    await waitFor(() => expect(client.getQueryData(READING_LIST_IDS_KEY)).toEqual([]))
    expect(notify.success).not.toHaveBeenCalled()
  })

  it('a failure flips it back and shows the API’s message', async () => {
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) =>
      opts.method
        ? Promise.reject(new ApiError({ status: 429, code: 'throttled', detail: 'کمی صبر کنید.' }))
        : Promise.resolve(savedList([])),
    )
    renderButton()
    const button = await screen.findByRole('button', { name: SAVE })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await userEvent.click(button)
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('کمی صبر کنید.'))
    expect(button).toHaveAttribute('aria-pressed', 'false')
  })

  it('a 401 (the session is gone) flips it back, ends the session and goes to login', async () => {
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) =>
      opts.method
        ? Promise.reject(new ApiError({ status: 401, code: 'not_authenticated' }))
        : Promise.resolve(savedList([])),
    )
    const { client } = renderButton()
    const button = await screen.findByRole('button', { name: SAVE })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await userEvent.click(button)
    await waitFor(() => expect(mocks.push).toHaveBeenCalledWith('/login/'))
    expect(button).toHaveAttribute('aria-pressed', 'false')
    expect(notify.error).not.toHaveBeenCalled()
    // The viewer's ids are gone with the session: nothing reads them again.
    expect(client.getQueryData(READING_LIST_IDS_KEY)).toBeUndefined()
  })

  it('the blog switched off meanwhile: flipped back, the reason shown, the switch turned off', async () => {
    const refusal = ApiError.fromBody(503, {
      data: {
        errors: [{ code: 'feature_disabled', detail: 'وبلاگ تا فردا بسته است.', attr: null }],
        feature: 'blog',
      },
    })
    mocks.bffFetch.mockImplementation((path: string, opts: { method?: string } = {}) =>
      opts.method ? Promise.reject(refusal) : Promise.resolve(savedList([])),
    )
    const { onFeatureDisabled } = renderButton()
    const button = await screen.findByRole('button', { name: SAVE })
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await userEvent.click(button)
    await waitFor(() => expect(notify.error).toHaveBeenCalledWith('وبلاگ تا فردا بسته است.'))
    expect(onFeatureDisabled).toHaveBeenCalledWith('blog', 'وبلاگ تا فردا بسته است.')
  })
})
