import { screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PurchaseReviewForm } from '@/features/orders/reviews/purchase-review-form'
import { ApiError } from '@/lib/api/errors'
import type { AwaitingReviewProduct } from '@/lib/api/types/order-review'
import { stubBrowserApis } from '../support/dom-stubs'
import { calls, ok, refuse, renderAccount, reviewsPage, serve } from './account-support'

// A purchase's review (order digest §3.1.7, §6.5, §8.2): the rating is REQUIRED (1–5: the
// backend's `PurchaseReviewCreateSerializer`), the text required and not blank (≤ 4096), the title
// optional (≤ 255), up to ten positive and ten negative points (≤ 255 each, no repeats). One
// `POST order/<code>/review/` per press. The API's answers: 201 → its own sentence; field errors
// under their fields; the purchase no longer reviewable here (not in the order, already reviewed,
// not eligible, not this account's) → the list is stale; 503 `product_comments` → the submit
// is disabled with the shop's reason; 429 → a wait on the button.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/reviews/',
}))

const ORDER = '6270624849'
const PRODUCT = reviewsPage().results[0]!.products[0]! as AwaitingReviewProduct
const REVIEW = `order/${ORDER}/review/`
const SAVED = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'

beforeEach(() => {
  stubBrowserApis()
  mocks.bffFetch.mockReset()
  serve(mocks.bffFetch, { [REVIEW]: () => ok({}, SAVED, 201) })
})

function renderForm(features = {}) {
  const onSubmitted = vi.fn()
  const onStale = vi.fn()
  const view = renderAccount(
    <PurchaseReviewForm
      orderCode={ORDER}
      product={PRODUCT}
      onSubmitted={onSubmitted}
      onStale={onStale}
    />,
    { features },
  )
  return { ...view, onSubmitted, onStale, user: userEvent.setup() }
}

const submit = () => screen.getByRole('button', { name: 'ثبت دیدگاه' })
const text = () => screen.getByRole('textbox', { name: /متن دیدگاه/ })
const star = (score: string) => screen.getByRole('radio', { name: new RegExp(`^${score} ستاره`) })
const sent = () => calls(mocks.bffFetch, REVIEW).map(([, init]) => (init as { body: unknown }).body)

describe('what it needs', () => {
  it('the rating is required: a labelled group of five stars, chosen by keyboard too', async () => {
    const { user } = renderForm()
    const group = screen.getByRole('radiogroup', { name: /امتیاز شما/ })
    expect(group).toHaveAttribute('aria-required', 'true')
    expect(within(group).getAllByRole('radio')).toHaveLength(5)
    // No «(اختیاری)» and no way to take the rating back: it is not optional here.
    expect(group).not.toHaveTextContent('اختیاری')
    await user.click(star('۳'))
    await user.keyboard('{ArrowDown}')
    expect(star('۴')).toBeChecked()
  })

  it('without a rating nothing is sent; the rating says so and takes the focus', async () => {
    const { user } = renderForm()
    await user.type(text(), 'خوب بود')
    await user.click(submit())
    expect(sent()).toHaveLength(0)
    const group = screen.getByRole('radiogroup', { name: /امتیاز شما/ })
    expect(group).toHaveAccessibleDescription(/امتیاز.*انتخاب کنید/)
    expect(group).toContainElement(document.activeElement as HTMLElement)
  })

  it('a blank text is refused here too (spaces only)', async () => {
    const { user } = renderForm()
    await user.click(star('۵'))
    await user.type(text(), '   ')
    await user.click(submit())
    expect(sent()).toHaveLength(0)
    expect(text()).toHaveAccessibleDescription(/متن دیدگاه را بنویسید/)
    expect(text()).toHaveFocus()
  })
})

describe('what is sent', () => {
  it('one review per press, in the API’s names; empty optionals left out', async () => {
    const { user, onSubmitted } = renderForm()
    await user.click(star('۴'))
    await user.type(text(), '  کاغذ خوبی دارد  ')
    await user.dblClick(submit())
    expect(sent()).toEqual([{ product_id: PRODUCT.id, rating: 4, review: 'کاغذ خوبی دارد' }])
    expect(onSubmitted).toHaveBeenCalledWith(SAVED)
  })

  it('the title and the points: trimmed, without repeats, at most ten each', async () => {
    const { user } = renderForm()
    await user.click(star('۵'))
    await user.type(screen.getByRole('textbox', { name: /عنوان/ }), ' عالی ')
    await user.type(text(), 'متن')
    const pros = screen.getByRole('textbox', { name: /نقاط قوت/ })
    for (const point of ['سبک', 'سبک', ' جلد محکم ']) {
      await user.type(pros, point)
      await user.keyboard('{Enter}')
    }
    const cons = screen.getByRole('textbox', { name: /نقاط ضعف/ })
    for (let index = 1; index <= 10; index++) {
      await user.type(cons, `مورد ${index}`)
      await user.keyboard('{Enter}')
    }
    expect(cons).toBeDisabled()
    await user.click(submit())
    const [body] = sent() as Record<string, unknown>[]
    expect(body).toMatchObject({ title: 'عالی', positive_points: ['سبک', 'جلد محکم'] })
    expect(body!.negative_points).toHaveLength(10)
  })
})

describe('the API’s answers', () => {
  it('field errors go under their fields (an indexed point under its list)', async () => {
    serve(mocks.bffFetch, {
      [REVIEW]: () =>
        Promise.reject(
          ApiError.fromBody(400, {
            msg: 'درخواست ارسالی معتبر نیست.',
            data: {
              type: 'validation_error',
              errors: [
                { code: 'max_value', detail: 'امتیاز حداکثر ۵ است.', attr: 'rating' },
                {
                  code: 'max_length',
                  detail: 'هر مورد حداکثر ۲۵۵ نویسه.',
                  attr: 'positive_points.0',
                },
              ],
            },
          }),
        ),
    })
    const { user } = renderForm()
    await user.click(star('۵'))
    await user.type(text(), 'متن')
    await user.click(submit())
    expect(await screen.findByText('امتیاز حداکثر ۵ است.')).toBeVisible()
    expect(screen.getByText('هر مورد حداکثر ۲۵۵ نویسه.')).toBeVisible()
  })

  it.each([
    [404, 'order_review_product_not_in_order'],
    [404, 'not_found'],
    [409, 'order_review_already_submitted'],
    [409, 'order_review_not_eligible'],
  ])(
    '%i %s: the purchase cannot be reviewed here any more: the list is stale',
    async (status, code) => {
      serve(mocks.bffFetch, { [REVIEW]: () => refuse(status, code, `پیام ${code}`) })
      const { user, onStale, onSubmitted } = renderForm()
      await user.click(star('۲'))
      await user.type(text(), 'متن')
      await user.click(submit())
      expect(onStale).toHaveBeenCalledTimes(1)
      expect(onStale.mock.calls[0]![0]).toEqual(expect.any(String))
      expect(onSubmitted).not.toHaveBeenCalled()
    },
  )

  it('503 product_comments: the submit is disabled with the shop’s reason (the form stays)', async () => {
    serve(mocks.bffFetch, {
      [REVIEW]: () =>
        refuse(503, 'feature_disabled', 'ثبت دیدگاه موقتاً بسته است.', {
          feature: 'product_comments',
          feature_name: 'دیدگاه محصولات',
        }),
    })
    const { user } = renderForm()
    await user.click(star('۲'))
    await user.type(text(), 'متن')
    await user.click(submit())
    expect(await screen.findByText('ثبت دیدگاه موقتاً بسته است.')).toBeVisible()
    expect(submit()).toBeDisabled()
    expect(text()).toHaveValue('متن')
  })

  it('product comments already off: the submit is disabled from the start, with the reason', () => {
    renderForm({
      product_comments: { key: 'product_comments', enabled: false, reason: 'دیدگاه‌ها بسته است.' },
    })
    expect(submit()).toBeDisabled()
    expect(screen.getByText('دیدگاه‌ها بسته است.')).toBeVisible()
  })

  it('429: the wait on the button, nothing sent while it runs', async () => {
    serve(mocks.bffFetch, {
      [REVIEW]: () => refuse(429, 'throttled', 'زیاد', { retry_after: 120 }),
    })
    const { user } = renderForm()
    await user.click(star('۲'))
    await user.type(text(), 'متن')
    await user.click(submit())
    expect(await screen.findByText(/زمان باقی‌مانده تا تلاش دوباره/)).toBeVisible()
    await user.click(submit())
    expect(sent()).toHaveLength(1)
  })
})
