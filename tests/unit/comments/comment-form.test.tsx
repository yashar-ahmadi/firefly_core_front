import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SubjectCommentComposer } from '@/features/comments/subject-comment-composer'
import { subjectCommentsKey } from '@/features/comments/subjects'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// The comment form of a post or a page (blog digest §1.7, content digest §4.2), opened in place
// by its button; a post's here: a guest's name and e-mail (a signed-in visitor's come from the
// account), the honeypot, every empty optional left out; once sent, the API's moderation notice
// (focused) and nothing inserted; a 429 waits out `retry_after`; a switched-off comments switch
// takes the form away. (A page's own gate: tests/unit/content/page-comments.test.tsx.)

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

stubBrowserApis()

const SLUG = 'best-phones-under-30m'
const POST = { kind: 'post', slug: SLUG } as const
const SUBMIT = `blog/post/${SLUG}/comment/submit/`
const OK = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'

function renderComposer({
  type = 'comment' as 'comment' | 'question',
  parentId = undefined as number | undefined,
  hasSession = false,
} = {}) {
  const { wrapper: Base, client } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  render(<SubjectCommentComposer subject={POST} type={type} parentId={parentId} />, { wrapper })
  return { client, user: userEvent.setup() }
}

const writes = () => mocks.bffFetch.mock.calls.filter(([path]) => path === SUBMIT)
const textBox = () => screen.findByRole('textbox', { name: /^متن/ })

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('SubjectCommentComposer: a post’s form', () => {
  it('a guest gives a name (and may give an e-mail); a signed-in visitor gives neither', async () => {
    const { user } = renderComposer()
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await textBox()
    expect(screen.getByRole('textbox', { name: /^نام/ })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^ایمیل/ })).toBeInTheDocument()
  })

  it('signed in: the text alone', async () => {
    const { user } = renderComposer({ hasSession: true })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await textBox()
    expect(screen.queryByRole('textbox', { name: /^نام/ })).toBeNull()
    expect(screen.queryByRole('textbox', { name: /^ایمیل/ })).toBeNull()
  })

  it('sends what was typed and nothing empty; the notice replaces the form, focused; nothing inserted', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const { client, user } = renderComposer()
    const listed = { pages: [{ results: [] }], pageParams: [1] }
    client.setQueryData([...subjectCommentsKey(POST), 'comment'], listed)
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), ' ممنون ')
    await user.type(screen.getByRole('textbox', { name: /^نام/ }), 'علی')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    const status = await screen.findByRole('status')
    expect(status).toHaveTextContent(OK)
    expect(status).toHaveFocus()
    expect(writes()).toEqual([[SUBMIT, { method: 'POST', body: { review: 'ممنون', name: 'علی' } }]])
    // Moderated: never put in the list, and the list is not read again for it.
    expect(client.getQueryData([...subjectCommentsKey(POST), 'comment'])).toBe(listed)
    expect(mocks.bffFetch).toHaveBeenCalledTimes(1)
    // Opened again: an empty form.
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    expect(await textBox()).toHaveValue('')
  })

  // The API's 201 always has its `msg` today; without one the form says it, in the UI's word.
  it('without the API’s msg: the form’s own notice, «دیدگاه» as the buttons say', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 201 })
    const { user } = renderComposer({ hasSession: true })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), 'ممنون')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByRole('status')).toHaveTextContent(
      'دیدگاه شما ثبت شد و پس از تأیید نمایش داده می\u{200C}شود.',
    )
  })

  it('a question says so; a reply names its parent (the type is the parent’s)', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const question = renderComposer({ type: 'question', hasSession: true })
    await question.user.click(screen.getByRole('button', { name: 'ثبت پرسش' }))
    await question.user.type(await textBox(), 'گارانتی دارد؟')
    await question.user.click(screen.getByRole('button', { name: 'ارسال پرسش' }))
    await screen.findByRole('status')
    expect(writes()[0]![1].body).toEqual({ review: 'گارانتی دارد؟', comment_type: 'question' })

    mocks.bffFetch.mockClear()
    document.body.innerHTML = ''
    const reply = renderComposer({ parentId: 10002, hasSession: true })
    await reply.user.click(screen.getByRole('button', { name: 'پاسخ' }))
    await reply.user.type(await textBox(), 'موافقم')
    await reply.user.click(screen.getByRole('button', { name: 'ارسال پاسخ' }))
    await screen.findByRole('status')
    expect(writes()[0]![1].body).toEqual({ review: 'موافقم', parent: 10002 })
  })

  it('checks the text and a guest’s name first, the focus on the first to fix', async () => {
    const { user } = renderComposer()
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await textBox()
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByText('متن دیدگاه را بنویسید.')).toBeInTheDocument()
    expect(screen.getByText('نام خود را بنویسید.')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByRole('textbox', { name: /^متن/ })).toHaveFocus())
    expect(writes()).toEqual([])
  })

  it('the API’s field errors go under their fields, several at once', async () => {
    mocks.bffFetch.mockRejectedValue(
      ApiError.fromBody(400, {
        data: {
          errors: [
            { code: 'max_length', attr: 'review', detail: 'متن بلند است.' },
            { code: 'invalid', attr: 'email', detail: 'پست الکترونیکی صحیح وارد کنید.' },
          ],
        },
      }),
    )
    const { user } = renderComposer()
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), 'متن')
    await user.type(screen.getByRole('textbox', { name: /^نام/ }), 'علی')
    await user.type(screen.getByRole('textbox', { name: /^ایمیل/ }), 'a@b')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByText('متن بلند است.')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /^ایمیل/ })).toHaveAccessibleDescription(
      /پست الکترونیکی صحیح وارد کنید/,
    )
  })

  it('a 429 waits out retry_after: the button holds, a press sends nothing more', async () => {
    mocks.bffFetch.mockRejectedValue(
      ApiError.fromBody(429, {
        data: { errors: [{ code: 'throttled', attr: null, detail: 'x' }], retry_after: 30 },
      }),
    )
    const { user } = renderComposer({ hasSession: true })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), 'متن')
    const send = screen.getByRole('button', { name: 'ارسال دیدگاه' })
    await user.click(send)
    expect(await screen.findByText('لطفاً کمی بعد دوباره تلاش کنید.')).toBeInTheDocument()
    await waitFor(() => expect(send).toHaveAttribute('aria-disabled', 'true'))
    expect(send).toHaveAccessibleDescription(/زمان باقی\u{200C}مانده تا تلاش دوباره: ۰۰:[۲۳][۰-۹]/u)
    await user.click(send)
    expect(writes()).toHaveLength(1)
  })

  it('a signed-in visitor the API took for a guest (session ended) is asked for the name', async () => {
    mocks.bffFetch.mockRejectedValue(
      ApiError.fromBody(400, {
        data: { errors: [{ code: 'invalid', attr: 'name', detail: 'نام الزامی است.' }] },
      }),
    )
    const { user } = renderComposer({ hasSession: true })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), 'متن')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByRole('textbox', { name: /^نام/ })).toHaveAccessibleDescription(
      /نام الزامی است/,
    )
  })

  it('comments switched off meanwhile (503 blog_comments): the form goes, the reason stays', async () => {
    mocks.bffFetch.mockRejectedValue(
      ApiError.fromBody(503, {
        data: {
          errors: [{ code: 'feature_disabled', attr: null, detail: 'ثبت دیدگاه بسته است.' }],
          feature: 'blog_comments',
        },
      }),
    )
    const { user } = renderComposer({ hasSession: true })
    await user.click(screen.getByRole('button', { name: 'ثبت دیدگاه' }))
    await user.type(await textBox(), 'متن')
    await user.click(screen.getByRole('button', { name: 'ارسال دیدگاه' }))
    expect(await screen.findByText('ثبت دیدگاه بسته است.')).toBeInTheDocument()
    expect(screen.queryByRole('form')).toBeNull()
    expect(screen.queryByRole('button', { name: 'ثبت دیدگاه' })).toBeNull()
  })
})
