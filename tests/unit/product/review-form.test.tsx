import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewForm } from '@/features/product/components/reviews/review-form'
import { FeatureProvider } from '@/features/settings/feature-context'
import { ApiError, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))

const SLUG = 'samsung-galaxy-s25-ultra'
const PATH = `product/detail/${SLUG}/comment/submit/`
const OK = 'نظر شما با موفقیت ثبت شد و پس از تأیید نمایش داده می شود.'
const SUBMIT = 'ارسال دیدگاه'
const NAME = /^نام \(/
const REVIEW = /^متن دیدگاه/
const EMAIL = /^ایمیل/
const TITLE = /^عنوان دیدگاه/
const POSITIVE = /^نقاط قوت/
const THROTTLED = 'درخواست شما محدود شد. لطفاً کمی بعد دوباره تلاش کنید.'
const NEGATIVE = /^نقاط ضعف/

function refused(errors: { code: string; attr: string | null; detail: string }[], status = 400) {
  return new ApiError({ status, errors })
}

function renderForm(
  options: { hasSession?: boolean; parentId?: number; onDone?: (msg: string) => void } = {},
) {
  const { wrapper: Base } = clientProviders({ hasSession: options.hasSession ?? false })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <Base>
      <FeatureProvider initial={{}}>{children}</FeatureProvider>
    </Base>
  )
  const onDone = options.onDone ?? vi.fn()
  render(<ReviewForm slug={SLUG} parentId={options.parentId} onDone={onDone} />, { wrapper })
  return { user: userEvent.setup(), onDone }
}

const field = (name: RegExp) => screen.getByRole('textbox', { name })
const submit = () => screen.getByRole('button', { name: SUBMIT })

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('ReviewForm for a guest: validation', () => {
  it('asks for the name before sending anything (the API checks it only last)', async () => {
    const { user } = renderForm()
    await user.type(field(REVIEW), 'گوشی خوبی است')
    await user.click(submit())
    expect(field(NAME)).toHaveAttribute('aria-invalid', 'true')
    expect(field(NAME)).toHaveAccessibleDescription('نام خود را بنویسید.')
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it('asks for the review text, and focuses the first field to fix', async () => {
    const { user } = renderForm()
    await user.click(submit())
    expect(field(REVIEW)).toHaveAccessibleDescription('متن دیدگاه را بنویسید.')
    expect(field(NAME)).toHaveAccessibleDescription('نام خود را بنویسید.')
    expect(field(REVIEW)).toHaveFocus()
    expect(mocks.bffFetch).not.toHaveBeenCalled()
  })

  it("surfaces the backend's `invalid` name error under the name field", async () => {
    const detail = 'وارد کردن نام برای کاربران مهمان الزامی است.'
    mocks.bffFetch.mockRejectedValue(refused([{ code: 'invalid', attr: 'name', detail }]))
    const { user } = renderForm()
    await user.type(field(REVIEW), 'گوشی خوبی است')
    await user.type(field(NAME), 'سارا')
    await user.click(submit())
    await waitFor(() => expect(field(NAME)).toHaveAccessibleDescription(detail))
    expect(field(NAME)).toHaveAttribute('aria-invalid', 'true')
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('puts an indexed point error (positive_points.1) under that list', async () => {
    const detail = 'این مقدار نباید خالی باشد.'
    mocks.bffFetch.mockRejectedValue(
      refused([{ code: 'blank', attr: 'positive_points.1', detail }]),
    )
    const { user } = renderForm()
    await user.type(field(REVIEW), 'خوب')
    await user.type(field(NAME), 'سارا')
    await user.type(field(POSITIVE), 'دوربین{Enter}')
    await user.click(submit())
    await waitFor(() =>
      expect(field(POSITIVE)).toHaveAccessibleDescription(expect.stringContaining(detail)),
    )
    expect(field(POSITIVE)).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('ReviewForm payload', () => {
  it('omits every empty optional: no email, title, rating or points', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const { user } = renderForm()
    await user.type(field(REVIEW), '  گوشی خوبی است  ')
    await user.type(field(NAME), 'سارا')
    await user.click(submit())
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      method: 'POST',
      body: { review: 'گوشی خوبی است', name: 'سارا' },
    })
  })

  it('sends the rating, title, e-mail and the points (trimmed, without duplicates)', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const { user } = renderForm()
    await user.click(screen.getByRole('radio', { name: '۴ ستاره: خوب' }))
    await user.type(field(TITLE), 'عالی ولی گران')
    await user.type(field(REVIEW), 'گوشی خوبی است')
    await user.type(field(POSITIVE), 'دوربین{Enter}')
    await user.type(field(POSITIVE), ' دوربین {Enter}')
    // Typed but not added: it is sent too.
    await user.type(field(POSITIVE), 'باتری')
    await user.type(field(NEGATIVE), 'قیمت{Enter}')
    await user.type(field(NAME), 'سارا')
    await user.type(field(EMAIL), 'sara@example.com')
    await user.click(submit())
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      method: 'POST',
      body: {
        review: 'گوشی خوبی است',
        name: 'سارا',
        email: 'sara@example.com',
        rating: 4,
        title: 'عالی ولی گران',
        positive_points: ['دوربین', 'باتری'],
        negative_points: ['قیمت'],
      },
    })
  })

  it('leaves the name and e-mail to the account of a signed-in shopper', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const { user } = renderForm({ hasSession: true })
    expect(screen.queryByRole('textbox', { name: NAME })).toBeNull()
    expect(screen.queryByRole('textbox', { name: EMAIL })).toBeNull()
    await user.type(field(REVIEW), 'خوب')
    await user.click(submit())
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, { method: 'POST', body: { review: 'خوب' } })
  })

  it('a reply has text only and names its parent', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const { user } = renderForm({ parentId: 10026 })
    expect(screen.queryByRole('radio')).toBeNull()
    expect(screen.queryByRole('textbox', { name: TITLE })).toBeNull()
    expect(screen.queryByRole('textbox', { name: POSITIVE })).toBeNull()
    await user.type(screen.getByRole('textbox', { name: /^متن پاسخ/ }), 'شرکتی است')
    await user.type(field(NAME), 'علی')
    await user.click(screen.getByRole('button', { name: 'ارسال پاسخ' }))
    expect(mocks.bffFetch).toHaveBeenCalledWith(PATH, {
      method: 'POST',
      body: { review: 'شرکتی است', name: 'علی', parent: 10026 },
    })
  })
})

describe('ReviewForm after the API answers', () => {
  it('hands back the moderation message and resets the fields', async () => {
    mocks.bffFetch.mockResolvedValue({ data: {}, msg: OK, status: 201 })
    const onDone = vi.fn()
    const { user } = renderForm({ onDone })
    await user.click(screen.getByRole('radio', { name: '۵ ستاره: عالی' }))
    await user.type(field(REVIEW), 'عالی')
    await user.type(field(NAME), 'سارا')
    await user.click(submit())
    await waitFor(() => expect(onDone).toHaveBeenCalledWith(OK))
    expect(field(REVIEW)).toHaveValue('')
    expect(field(NAME)).toHaveValue('')
    expect(screen.getByRole('radio', { name: '۵ ستاره: عالی' })).not.toBeChecked()
  })

  it.each([
    ['no connection', ApiError.network(), NETWORK_ERROR_DETAIL],
    ['a page that is not the API', ApiError.nonJson(502), NETWORK_ERROR_DETAIL],
    [
      'too many submissions (429)',
      refused([{ code: 'throttled', attr: null, detail: THROTTLED }], 429),
      THROTTLED,
    ],
  ])('says why at the form when it fails with %s', async (_, error, detail) => {
    mocks.bffFetch.mockRejectedValue(error)
    const { user } = renderForm()
    await user.type(field(REVIEW), 'عالی')
    await user.type(field(NAME), 'سارا')
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(submit()).toBeEnabled()
  })

  it('shows an error for a field the form does not show (the session ended) at the form', async () => {
    const detail = 'وارد کردن نام برای کاربران مهمان الزامی است.'
    mocks.bffFetch.mockRejectedValue(refused([{ code: 'invalid', attr: 'name', detail }]))
    const { user } = renderForm({ hasSession: true })
    await user.type(field(REVIEW), 'عالی')
    await user.click(submit())
    // The name field appears with the API's message, like the back-in-stock form.
    await waitFor(() => expect(field(NAME)).toHaveAccessibleDescription(detail))
  })
})

describe('ReviewForm replying to an entry that is gone', () => {
  it('says so at the form instead of the raw «not found» message', async () => {
    mocks.bffFetch.mockRejectedValue(
      refused([
        {
          code: 'does_not_exist',
          attr: 'parent',
          detail: 'موردی با شناسه\u{0654} «10026» یافت نشد.',
        },
      ]),
    )
    const { user } = renderForm({ parentId: 10026 })
    await user.type(screen.getByRole('textbox', { name: /^متن پاسخ/ }), 'شرکتی است')
    await user.type(field(NAME), 'علی')
    await user.click(screen.getByRole('button', { name: 'ارسال پاسخ' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('این مورد دیگر در دسترس نیست.')
  })
})

describe('ReviewForm controls', () => {
  it('rates with a radio group of five large stars, optional and clearable', async () => {
    const { user } = renderForm()
    const group = screen.getByRole('group', { name: /^امتیاز شما/ })
    const stars = within(group).getAllByRole('radio')
    expect(stars.map((star) => star.getAttribute('aria-label'))).toEqual([
      '۱ ستاره: خیلی بد',
      '۲ ستاره: بد',
      '۳ ستاره: معمولی',
      '۴ ستاره: خوب',
      '۵ ستاره: عالی',
    ])
    for (const star of stars) expect(star.closest('label')).toHaveClass('size-11')
    await user.click(stars[2]!)
    expect(stars[2]).toBeChecked()
    // Arrow keys move the choice, as in any radio group.
    await user.keyboard('{ArrowDown}')
    expect(stars[3]).toBeChecked()
    expect(within(group).getByText('خوب')).toBeInTheDocument()
    await user.click(within(group).getByRole('button', { name: 'حذف امتیاز' }))
    for (const star of stars) expect(star).not.toBeChecked()
  })

  it('adds and removes points with 44px buttons, up to ten', async () => {
    const { user } = renderForm()
    const add = screen.getByRole('button', { name: 'افزودن نقطه\u{0654} قوت' })
    expect(add).toHaveClass('h-11')
    for (let n = 1; n <= 10; n += 1) await user.type(field(POSITIVE), `مورد ${n}{Enter}`)
    const list = screen.getByRole('list', { name: 'نقاط قوت' })
    expect(within(list).getAllByRole('listitem')).toHaveLength(10)
    expect(field(POSITIVE)).toBeDisabled()
    expect(add).toBeDisabled()
    // The box is disabled at ten: the focus goes to the last point's remove button.
    expect(within(list).getByRole('button', { name: 'حذف «مورد 10»' })).toHaveFocus()
    const remove = within(list).getByRole('button', { name: 'حذف «مورد 3»' })
    expect(remove).toHaveClass('size-11')
    await user.click(remove)
    expect(within(list).getAllByRole('listitem')).toHaveLength(9)
    expect(field(POSITIVE)).toBeEnabled()
    // The focus moves to the next point's remove button, never to <body>.
    await waitFor(() =>
      expect(within(list).getByRole('button', { name: 'حذف «مورد 4»' })).toHaveFocus(),
    )
  })

  it('after removing the last point, the focus goes to the previous one, then to the box', async () => {
    const { user } = renderForm()
    await user.type(field(POSITIVE), 'دوربین{Enter}')
    await user.type(field(POSITIVE), 'باتری{Enter}')
    await user.click(screen.getByRole('button', { name: 'حذف «باتری»' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'حذف «دوربین»' })).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'حذف «دوربین»' }))
    await waitFor(() => expect(field(POSITIVE)).toHaveFocus())
  })

  it('has a honeypot no person can reach', () => {
    renderForm()
    const trap = document.querySelector<HTMLInputElement>('input[name="website"]')!
    expect(trap).toHaveAttribute('tabindex', '-1')
    expect(trap).toHaveAttribute('autocomplete', 'off')
    expect(trap.closest('[aria-hidden="true"]')).not.toBeNull()
  })
})
