import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PostCommentList } from '@/features/blog/components/post-comment-list'
import { PostComments } from '@/features/blog/components/post-comments'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { BlogComment } from '@/lib/api/types/blog-post'
import { stubBrowserApis } from '../support/dom-stubs'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'
import { clientProviders } from '../support/providers'
import { paginated } from './page-support'
import { commentFixture, liveThreads } from './post-fixtures'

// A post's comments and Q&A (blog digest §1.7): two tabs with the post's counts, each a list of
// threads with their replies (the shop's answer «پاسخ رسمی», the visitor's own «شما»), the
// comments' first page server-rendered, the questions read once their tab opens.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

stubBrowserApis()
// A list is read once it comes near the viewport (or its tab opens): the test says when.
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

const SLUG = 'best-phones-under-30m'
const CLOSED = 'ثبت دیدگاه روی مطالب وبلاگ تا اطلاع بعدی بسته است.'

type Switches = Partial<Record<'blog' | 'blog_comments', string | null>>

/** The shell's feature map: a switch given a reason (or null) is off. */
function features(off: Switches): Partial<FeatureMap> {
  const map: Partial<FeatureMap> = {}
  for (const [key, reason] of Object.entries(off) as [keyof Switches, string | null][]) {
    map[key] = { key, name: '', enabled: false, reason }
  }
  return map
}

interface SectionOptions {
  off?: Switches
  hasSession?: boolean
  questions?: BlogComment[]
}

function renderSection({ off = {}, hasSession = false, questions = [] }: SectionOptions = {}) {
  const questionCount = questions.length
  mocks.bffFetch.mockImplementation(
    (path: string, { query }: { query: { comment_type: string } }) =>
      Promise.resolve({
        data: paginated(query.comment_type === 'question' ? questions : liveThreads()),
        msg: '',
        status: 200,
      }),
  )
  const { wrapper: Base } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={features(off)}>{children}</FeatureProvider>
    </Base>
  )
  render(
    <PostComments slug={SLUG} commentCount={2} questionCount={questionCount}>
      <PostCommentList
        slug={SLUG}
        type="comment"
        count={2}
        initialPage={paginated(liveThreads())}
      />
    </PostComments>,
    { wrapper },
  )
  return { user: userEvent.setup() }
}

const listReads = (type: string) =>
  mocks.bffFetch.mock.calls.filter(([, options]) => options?.query?.comment_type === type)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  resetIntersections()
})

describe('PostComments', () => {
  it('two tabs named with the post’s counts; the comments first, from the server’s page', () => {
    renderSection({ questions: [commentFixture({ comment_type: 'question' })] })
    const tabs = within(screen.getByRole('tablist')).getAllByRole('tab')
    // The badge is seen; a screen reader hears the count as words, never glued to the label.
    expect(tabs[0]).toHaveAccessibleName('دیدگاه\u{200C}ها، ۲ دیدگاه')
    expect(tabs[1]).toHaveAccessibleName('پرسش و پاسخ، ۱ پرسش')
    expect(within(tabs[0]!).getByText('۲')).toHaveAttribute('aria-hidden', 'true')
    expect(tabs[0]).toHaveAttribute('aria-selected', 'true')
    const list = screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })
    expect(within(list).getAllByRole('article')).toHaveLength(3)
    // A guest's page 1 is the server's: nothing asked.
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('the keyboard moves between the tabs; the questions are read once their tab opens', async () => {
    const question = commentFixture({ id: 7, comment_type: 'question', review: 'ارسال دارد؟' })
    const { user } = renderSection({ questions: [question] })
    expect(listReads('question')).toHaveLength(0)
    screen.getAllByRole('tab')[0]!.focus()
    // RTL: the next tab is on the left.
    await user.keyboard('{ArrowLeft}')
    expect(screen.getByRole('tab', { name: /پرسش و پاسخ/ })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    act(() => intersect())
    expect(await screen.findByText('ارسال دارد؟')).toBeInTheDocument()
    expect(listReads('question')).toHaveLength(1)
  })

  it('the shop’s answer is «پاسخ رسمی», nested under its thread', () => {
    renderSection()
    const answer = screen.getByRole('list', { name: 'پاسخ\u{200C}ها به علی کریمی' })
    expect(within(answer).getByText('پاسخ رسمی')).toBeInTheDocument()
    expect(within(answer).getByText('تیم محتوای فایرفلای')).toBeInTheDocument()
  })

  it('signed in, page 1 is read again through the BFF: the visitor’s own entry says «شما»', async () => {
    const own = liveThreads().map((thread) =>
      thread.id === 10001 ? { ...thread, is_current_user: true } : thread,
    )
    renderSection({ hasSession: true })
    mocks.bffFetch.mockResolvedValue({ data: paginated(own), msg: '', status: 200 })
    act(() => intersect())
    await waitFor(() => expect(listReads('comment')).toHaveLength(1))
    const mine = await screen.findByText('شما')
    expect(mine.closest('article')).toHaveTextContent('سارا احمدی')
  })

  it('with blog comments off: the operator’s sentence, no form and no «پاسخ»; the lists stay', () => {
    renderSection({ off: { blog_comments: CLOSED } })
    expect(screen.getByText(CLOSED)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /^ثبت|^پاسخ$/ })).toBeNull()
    expect(screen.getByRole('list', { name: 'دیدگاه\u{200C}ها' })).toBeInTheDocument()
  })

  it('with the blog off: «وبلاگ موقتاً در دسترس نیست» and its reason instead; nothing read', () => {
    renderSection({ off: { blog: 'تا فردا.' } })
    expect(screen.getByText(/وبلاگ موقتاً در دسترس نیست/)).toBeInTheDocument()
    expect(screen.getByText('تا فردا.')).toBeInTheDocument()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })
})

describe('PostCommentList', () => {
  function renderList(threads: BlogComment[] | Error) {
    mocks.bffFetch.mockImplementation(() =>
      threads instanceof Error
        ? Promise.reject(threads)
        : Promise.resolve({ data: paginated(threads), msg: '', status: 200 }),
    )
    const { wrapper: Base } = clientProviders()
    const wrapper = ({ children }: { children: ReactNode }) => (
      <Base>
        <FeatureProvider initial={{}}>{children}</FeatureProvider>
      </Base>
    )
    render(<PostCommentList slug={SLUG} type="comment" count={1} />, { wrapper })
    act(() => intersect())
  }

  it('nests replies at any depth, the indentation stopping at two levels', async () => {
    const deep = (id: number, depth: number): BlogComment =>
      commentFixture({ id, name: `نفر ${id}`, replies: depth > 0 ? [deep(id + 1, depth - 1)] : [] })
    renderList([deep(1, 3)])
    const items = await screen.findAllByRole('listitem')
    expect(items.map((item) => item.dataset.depth)).toEqual(['0', '1', '2', '2'])
  })

  it('shows the text as typed (markup is text), its line breaks kept', async () => {
    renderList([commentFixture({ review: '<b>پررنگ</b>\nخط دوم' })])
    const text = await screen.findByText(/<b>پررنگ<\/b>/)
    expect(text).toHaveClass('whitespace-pre-wrap')
    expect(text.textContent).toBe('<b>پررنگ</b>\nخط دوم')
    expect(document.querySelector('b')).toBeNull()
  })

  it('a post gone meanwhile (404) says so, with a retry', async () => {
    renderList(new ApiError({ status: 404, code: 'not_found' }))
    expect(await screen.findByText('این مطلب دیگر در دسترس نیست.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })
})
