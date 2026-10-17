import { screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  commentsPage,
  DECLINED_REVIEW,
  PAGE_10001,
  PENDING_QUESTION,
  POST_10001,
  POST_REPLY,
  PRODUCT_10014,
} from './comment-fixtures'
import { newCommentsApi, renderComments, stubCommentsApi } from './comments-support'

// One row of «دیدگاه‌های من»: an article named by its subject (linked to its page), the status
// pill, the labels a row can carry, the visitor's text as plain text, the replies and «حذف دیدگاه»
// named with the subject.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/account/comments/',
  useSearchParams: () => new URLSearchParams(),
}))

let api = newCommentsApi()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  api = newCommentsApi()
  stubCommentsApi(mocks.bffFetch, api)
})

afterEach(() => {
  vi.restoreAllMocks()
})

const BLOG_OFF = { blog: { key: 'blog', name: 'وبلاگ', enabled: false, reason: null } } as const

async function rowOf(subject: string) {
  return screen.findByRole('article', { name: subject })
}

describe('CommentRow', () => {
  it('links each subject to its page: a product, a post, a page', async () => {
    api.list = () => commentsPage([PRODUCT_10014, POST_10001, PAGE_10001])
    renderComments()
    const product = await rowOf(PRODUCT_10014.subject.name)
    expect(within(product).getByRole('link', { name: PRODUCT_10014.subject.name })).toHaveAttribute(
      'href',
      '/product/tefal-air-fryer-xl/',
    )
    expect(
      within(await rowOf(POST_10001.subject.name)).getByRole('link', {
        name: POST_10001.subject.name,
      }),
    ).toHaveAttribute('href', '/blog/best-phones-under-30m/')
    const page = await rowOf(PAGE_10001.subject.name)
    expect(within(page).getByRole('link', { name: PAGE_10001.subject.name })).toHaveAttribute(
      'href',
      '/page/about-us/',
    )
    // A page has no thumbnail; a product has one.
    expect(within(page).queryByRole('img', { hidden: true })).toBeNull()
    expect(product.querySelector('img')).not.toBeNull()
  })

  it('with the blog off, a post’s name is text, not a link', async () => {
    api.list = () => commentsPage([POST_10001])
    renderComments({ features: BLOG_OFF })
    const post = await rowOf(POST_10001.subject.name)
    expect(within(post).queryByRole('link')).toBeNull()
    expect(within(post).getByRole('heading', { level: 2 })).toHaveTextContent(
      POST_10001.subject.name,
    )
  })

  it('a product review: title, stars, «خریدار», the status as the API says it, the date', async () => {
    api.list = () => commentsPage([PRODUCT_10014])
    renderComments()
    const review = await rowOf(PRODUCT_10014.subject.name)
    expect(within(review).getByRole('heading', { level: 3, name: 'خرید خوبی بود' })).toBeVisible()
    expect(within(review).getByRole('img', { name: 'امتیاز ۵ از ۵' })).toBeInTheDocument()
    expect(within(review).getByText('خریدار')).toBeVisible()
    expect(within(review).getByText('تأیید شده')).toBeVisible()
    expect(within(review).getByText('۲ مرداد ۱۴۰۵')).toBeVisible()
    expect(within(review).queryByText('پرسش')).toBeNull()
  })

  it('a pending question and a declined review for an order: their labels and the order link', async () => {
    api.list = () => commentsPage([PENDING_QUESTION, DECLINED_REVIEW])
    renderComments()
    const question = await rowOf(PENDING_QUESTION.subject.name)
    expect(within(question).getByText('پرسش')).toBeVisible()
    expect(within(question).getByText('در انتظار تأیید')).toBeVisible()
    expect(within(question).queryByText('خریدار')).toBeNull()
    const declined = await rowOf(DECLINED_REVIEW.subject.name)
    expect(within(declined).getByText('رد شده')).toBeVisible()
    expect(within(declined).getByRole('link', { name: /سفارش/ })).toHaveAttribute(
      'href',
      '/account/orders/FF-1405-0042/',
    )
  })

  it('a reply the visitor wrote, its text with its line breaks, as plain text', async () => {
    api.list = () =>
      commentsPage([{ ...POST_REPLY, review: '<b>با شما موافقم.</b>\nمن هم همین را خریدم.' }])
    renderComments()
    const reply = await rowOf(POST_REPLY.subject.name)
    expect(within(reply).getByText('پاسخ شما به یک دیدگاه')).toBeVisible()
    const text = within(reply).getByText(/با شما موافقم/)
    expect(text.textContent).toBe('<b>با شما موافقم.</b>\nمن هم همین را خریدم.')
    expect(text.querySelector('b')).toBeNull()
    expect(text.className).toContain('whitespace-pre-line')
  })

  it('the replies under a comment, the shop’s marked «پاسخ فروشگاه»', async () => {
    api.list = () =>
      commentsPage([
        {
          ...PAGE_10001,
          replies: [
            ...PAGE_10001.replies,
            {
              id: 10003,
              name: 'علی رضایی',
              review: 'من هم همین‌طور.',
              is_user_admin: false,
              created: '2026-09-23T15:00:00+03:30',
            },
          ],
        },
      ])
    renderComments()
    const comment = await rowOf(PAGE_10001.subject.name)
    const replies = within(comment).getByRole('list', { name: 'پاسخ‌ها' })
    const items = within(replies).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('مدیر فروشگاه')).toBeVisible()
    expect(within(items[0]!).getByText('پاسخ فروشگاه')).toBeVisible()
    expect(within(items[1]!).getByText('علی رضایی')).toBeVisible()
    expect(within(items[1]!).queryByText('پاسخ فروشگاه')).toBeNull()
  })

  it('«حذف دیدگاه» is named with the subject; a long text offers «بیشتر», the whole text in it', async () => {
    const long = 'متن بلند. '.repeat(80)
    // jsdom lays nothing out: a clamped box shorter than its text.
    vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockReturnValue(400)
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(128)
    api.list = () => commentsPage([{ ...PRODUCT_10014, review: long }])
    const { user } = renderComments()
    const review = await rowOf(PRODUCT_10014.subject.name)
    expect(
      within(review).getByRole('button', {
        name: `حذف دیدگاه روی «${PRODUCT_10014.subject.name}»`,
      }),
    ).toBeVisible()
    const text = within(review).getByText(/متن بلند/)
    expect(text.textContent).toBe(long)
    expect(text.className).toContain('line-clamp')
    const more = within(review).getByRole('button', { name: 'بیشتر' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await user.click(more)
    expect(text.className).not.toContain('line-clamp')
    expect(within(review).getByRole('button', { name: 'کمتر' })).toHaveAttribute(
      'aria-expanded',
      'true',
    )
  })
})
