import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectCommentList } from '@/features/comments/subject-comment-list'
import { PageComments } from '@/features/content/pages/page-comments'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { SubjectComment } from '@/lib/api/types/subject-comment'
import { paginated } from '../blog/page-support'
import { stubBrowserApis } from '../support/dom-stubs'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'
import { clientProviders } from '../support/providers'
import { pageComment } from './page-fixtures'

// A content page's comments (content digest §3.2, §4): the blog's section and form on the page's
// contract (`pages/<slug>/comment/…`), behind the page's own gate: the forms only while
// `enable_comments`, gone with the API's sentence once a send finds them closed (403
// `page_comments_disabled`); the approved comments listed either way, the shop's answer «پاسخ
// فروشگاه».

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

stubBrowserApis()
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

const SLUG = 'about-us'
const PAGE = { kind: 'page', slug: SLUG } as const
const LIST = `pages/${SLUG}/comment/list/`
const SUBMIT = `pages/${SLUG}/comment/submit/`
const THREADS: SubjectComment[] = [
  pageComment({
    replies: [
      pageComment({
        id: 502,
        name: 'تیم فروشگاه',
        review: 'ممنون از شما.',
        is_user_admin: true,
        parent_id: 501,
      }),
    ],
  }),
]

const BLOG_COMMENTS_OFF = {
  blog_comments: { key: 'blog_comments', name: '', enabled: false, reason: 'بسته است.' },
} as const

function renderComments({
  open = true,
  questions = [] as SubjectComment[],
  features = {} as Partial<FeatureMap>,
} = {}) {
  mocks.bffFetch.mockImplementation(
    (path: string, options: { query?: { comment_type?: string } }) =>
      path === LIST
        ? Promise.resolve({
            data: paginated(options.query?.comment_type === 'question' ? questions : THREADS),
            msg: '',
            status: 200,
          })
        : Promise.reject(new Error(`unexpected ${path}`)),
  )
  const { wrapper: Base } = clientProviders()
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={features}>{children}</FeatureProvider>
    </Base>
  )
  render(
    <PageComments
      slug={SLUG}
      enableComments={open}
      commentCount={1}
      questionCount={questions.length}
    >
      <SubjectCommentList
        subject={PAGE}
        type="comment"
        count={1}
        initialPage={paginated(THREADS)}
      />
    </PageComments>,
    { wrapper },
  )
  return userEvent.setup()
}

const section = () => screen.getByRole('region', { name: 'دیدگاه\u{200C}ها و پرسش\u{200C}ها' })
const writes = () => mocks.bffFetch.mock.calls.filter(([path]) => path === SUBMIT)

beforeEach(() => {
  mocks.bffFetch.mockReset()
  resetIntersections()
})

describe('PageComments', () => {
  it('open: the composer, «پاسخ» under a root entry, the shop’s answer «پاسخ فروشگاه»', () => {
    renderComments()
    expect(within(section()).getByRole('button', { name: 'ثبت دیدگاه' })).toBeInTheDocument()
    expect(within(section()).getByRole('button', { name: 'پاسخ' })).toBeInTheDocument()
    const answer = screen.getByRole('list', { name: 'پاسخ\u{200C}ها به مریم' })
    expect(within(answer).getByText('پاسخ فروشگاه')).toBeInTheDocument()
    // The server's page 1: nothing asked of the BFF for a guest.
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('the blog’s comment switch is not the page’s: its forms stay open with blog_comments off', () => {
    renderComments({ features: BLOG_COMMENTS_OFF })
    expect(within(section()).getByRole('button', { name: 'ثبت دیدگاه' })).toBeInTheDocument()
    expect(within(section()).getByRole('button', { name: 'پاسخ' })).toBeInTheDocument()
  })

  it('closed (enable_comments false) with old comments: the list, the sentence, no form, no «پاسخ»', async () => {
    const user = renderComments({ open: false })
    expect(within(section()).getByText('صفحهٔ خوبی است.')).toBeInTheDocument()
    expect(within(section()).getByText('ثبت دیدگاه و پرسش برای این صفحه بسته است.')).toBeVisible()
    expect(within(section()).queryByRole('button', { name: /^ثبت|^پاسخ$/ })).toBeNull()
    // Nor on the questions' tab.
    await user.click(screen.getByRole('tab', { name: /پرسش و پاسخ/ }))
    expect(within(section()).queryByRole('button', { name: 'ثبت پرسش' })).toBeNull()
  })

  it('the questions are read through the BFF on the page’s own path once their tab opens', async () => {
    const question = pageComment({ id: 601, comment_type: 'question', review: 'ارسال دارید؟' })
    const user = renderComments({ questions: [question] })
    await user.click(screen.getByRole('tab', { name: /پرسش و پاسخ/ }))
    act(() => intersect())
    expect(await screen.findByText('ارسال دارید؟')).toBeInTheDocument()
    expect(mocks.bffFetch).toHaveBeenCalledWith(LIST, {
      query: { comment_type: 'question', page: 1 },
      signal: expect.any(AbortSignal),
    })
  })

  it('a send to the page’s own path; the moderation notice, nothing inserted', async () => {
    const user = renderComments()
    mocks.bffFetch.mockResolvedValueOnce({ data: {}, msg: 'نظر شما ثبت شد.', status: 201 })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await screen.findByRole('textbox', { name: /^متن دیدگاه/ }), 'عالی')
    await user.type(screen.getByRole('textbox', { name: /^نام/ }), 'سارا')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByRole('status')).toHaveTextContent('نظر شما ثبت شد.')
    expect(writes()).toEqual([[SUBMIT, { method: 'POST', body: { review: 'عالی', name: 'سارا' } }]])
    expect(within(section()).getAllByRole('article')).toHaveLength(2)
  })

  it('403 page_comments_disabled: every form goes, the API’s sentence takes the focus', async () => {
    const user = renderComments()
    const detail = 'ثبت نظر برای این صفحه غیرفعال شده است.'
    mocks.bffFetch.mockRejectedValueOnce(
      ApiError.fromBody(403, {
        msg: 'دسترسی غیرمجاز.',
        data: { errors: [{ code: 'page_comments_disabled', attr: null, detail }] },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await screen.findByRole('textbox', { name: /^متن دیدگاه/ }), 'عالی')
    await user.type(screen.getByRole('textbox', { name: /^نام/ }), 'سارا')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    const sentence = await within(section()).findByText(detail)
    await waitFor(() => expect(sentence).toHaveFocus())
    expect(screen.queryByRole('form')).toBeNull()
    expect(within(section()).queryByRole('button', { name: /^ثبت|^پاسخ$/ })).toBeNull()
    // The approved comments stay.
    expect(within(section()).getByText('صفحهٔ خوبی است.')).toBeInTheDocument()
    // The questions' tab says the same, without taking the focus from its tab (arrowed to: RTL,
    // the next tab is on the left).
    screen.getByRole('tab', { name: /^دیدگاه/ }).focus()
    await user.keyboard('{ArrowLeft}')
    const questions = screen.getByRole('tab', { name: /پرسش و پاسخ/ })
    expect(questions).toHaveAttribute('aria-selected', 'true')
    expect(await within(section()).findByText(detail)).toBeVisible()
    expect(questions).toHaveFocus()
  })

  it('404 on a send: the page is gone, said above the button', async () => {
    const user = renderComments()
    mocks.bffFetch.mockRejectedValueOnce(new ApiError({ status: 404, code: 'not_found' }))
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await screen.findByRole('textbox', { name: /^متن دیدگاه/ }), 'عالی')
    await user.type(screen.getByRole('textbox', { name: /^نام/ }), 'سارا')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('این صفحه دیگر در دسترس نیست.')
  })
})
