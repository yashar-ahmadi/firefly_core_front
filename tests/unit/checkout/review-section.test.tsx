import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLACEMENT_KEY_STORAGE } from '@/features/checkout/idempotency'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { TERMS } from '../payment/fixtures'
import {
  calls,
  onlineCart,
  PLACE,
  placeButton,
  placed,
  renderCheckout,
  serve,
} from './place-support'

// «بازبینی و ثبت سفارش» (spec §8.7; order digest §5.1–5.2; cart digest §6 step 9): the lines,
// receiver, shipping and payment route, the API's summary, an optional note, the operator's
// sentences (required when written), the placement key made on arrival and the cart read again
// before the button works; one placement however many presses.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), preload: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/features/checkout/placed/placed-loader', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/features/checkout/placed/placed-loader')>()),
  preloadPlacedPanel: mocks.preload,
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.preload.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

const review = () => screen.getByRole('region', { name: /بازبینی و ثبت سفارش/ })
const reviewSoon = () => screen.findByRole('region', { name: /بازبینی و ثبت سفارش/ })

describe('ReviewSection', () => {
  it('shows what is ordered, where, how it is paid, and the API’s online share', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart() })
    await placeButton()
    const section = review()
    expect(section).toHaveAttribute('data-state', 'active')
    expect(within(section).getByRole('list', { name: 'کالاهای سفارش' }).children.length).toBe(
      onlineCart().lines.length,
    )
    expect(section).toHaveTextContent('سارا احمدی')
    expect(section).toHaveTextContent('پیک موتوری تهران')
    // The shop's default route (the first enabled, never the wallet) and its gateway chooser.
    expect(section).toHaveTextContent('درگاه بانکی')
    expect(section).toHaveTextContent('زرین پال')
    expect(within(section).getByText('پرداخت آنلاین').closest('div')).toHaveTextContent(
      '۲٬۴۱۳٬۰۰۰ تومان',
    )
    expect(within(section).queryByText('پرداخت هنگام تحویل')).not.toBeInTheDocument()
    // The payment step is done, with what was chosen.
    const step = screen.getByRole('region', { name: /۳.*پرداخت/ })
    expect(step).toHaveAttribute('data-state', 'done')
    expect(step).toHaveTextContent('درگاه بانکی · زرین پال')
  })

  it('makes the placement key on arrival and reads the cart again before the button works', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    // The cart's reads wait until the test lets them answer.
    let release: () => void = () => {}
    const held = new Promise<void>((resolve) => (release = resolve))
    const served = mocks.bffFetch.getMockImplementation()!
    mocks.bffFetch.mockImplementation((path: string, init: unknown) =>
      path === 'cart/' ? held.then(() => served(path, init)) : served(path, init),
    )
    renderCheckout({ cart: onlineCart() })
    expect(await screen.findByText('در حال به\u{200C}روزرسانی سبد خرید…')).toBeInTheDocument()
    // Made in the review's effect, which follows the commit that shows the text: the wait for the
    // text can end before React runs it (about 1 in 40 runs on its own, more under load).
    await waitFor(() =>
      expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toMatch(/^[0-9a-f-]{36}$/),
    )
    expect(await placeButton()).toHaveAttribute('aria-disabled', 'true')
    expect(calls(mocks.bffFetch, 'cart/').length).toBeGreaterThan(0)
    await act(async () => release())
    await waitFor(() =>
      expect(screen.queryByText('در حال به\u{200C}روزرسانی سبد خرید…')).not.toBeInTheDocument(),
    )
    expect(await placeButton()).not.toHaveAttribute('aria-disabled')
  })

  it('a re-read that failed never lets the press through: said, with another try', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart())
    const served = mocks.bffFetch.getMockImplementation()!
    let fail = true
    mocks.bffFetch.mockImplementation((path: string, init: unknown) =>
      path === 'cart/' && fail ? Promise.reject(ApiError.network()) : served(path, init),
    )
    renderCheckout({ cart: onlineCart() })
    // The read is retried as every query is (a network error), then given up.
    const alert = await within(await reviewSoon()).findByRole('alert', {}, { timeout: 10_000 })
    expect(alert).toHaveTextContent('سبد خرید به\u{200C}روز نشد')
    expect(await placeButton()).toBeDisabled()
    fail = false
    await user.click(within(alert).getByRole('button', { name: 'تلاش دوباره' }))
    await waitFor(() => expect(screen.queryByText(/سبد خرید به\u{200C}روز نشد/u)).toBeNull())
    expect(await placeButton()).not.toHaveAttribute('aria-disabled')
    expect(await placeButton()).toBeEnabled()
    // Its amounts are named apart from the page's own summary.
    expect(within(review()).getByRole('region', { name: 'مبالغ سفارش' })).toBeInTheDocument()
  }, 20_000)

  it('fetches the placed order’s code once the shopper works in the form, not on arrival', async () => {
    // A returning shopper lands on the review with no interaction: that load stays in budget.
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart() })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled', 'true'))
    await userEvent.hover(button)
    expect(mocks.preload).not.toHaveBeenCalled()
    const note = within(review()).getByLabelText(/توضیحات سفارش/)
    await userEvent.click(note)
    await waitFor(() => expect(mocks.preload).toHaveBeenCalledTimes(1))
    await userEvent.type(note, 'عصر')
    await userEvent.click(within(review()).getByText(/توضیحات سفارش/))
    await new Promise((resolve) => setTimeout(resolve, 5))
    expect(mocks.preload).toHaveBeenCalledTimes(1)
  })
  it('the operator’s sentences must be ticked; then the note and the total go with the key', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart(), { [PLACE]: placed() })
    renderCheckout({ cart: onlineCart(), props: { terms: TERMS } })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await user.type(screen.getByLabelText(/توضیحات سفارش/), 'زنگ نزنید')
    await user.click(button)
    expect(calls(mocks.bffFetch, PLACE)).toHaveLength(0)
    const terms = screen.getByRole('checkbox', { name: /قوانین و مقررات/ })
    const age = screen.getByRole('checkbox', { name: /سن قانونی/ })
    expect(terms).toHaveAttribute('aria-invalid', 'true')
    expect(terms).toHaveFocus()
    expect(review()).toHaveTextContent('برای ثبت سفارش، این مورد را تأیید کنید.')
    await user.click(terms)
    await user.click(age)
    await user.click(button)
    await waitFor(() => expect(calls(mocks.bffFetch, PLACE)).toHaveLength(1))
    const [, init] = calls(mocks.bffFetch, PLACE)[0]!
    expect(init.idempotencyKey).toBe(
      sessionStorage.getItem(PLACEMENT_KEY_STORAGE) ?? init.idempotencyKey,
    )
    expect(init.body).toMatchObject({
      customer_note: 'زنگ نزنید',
      expected_total: 2_413_000,
      receiver: { first_name: 'سارا', mobile: '09121234501', postal_code: '1234567890' },
    })
  })

  it('the slots’ dialog links sit right after the terms’ checkbox (Plan 5 Task 5)', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({
      cart: onlineCart(),
      props: {
        terms: TERMS,
        termsLinks: (
          <>
            <button type="button">مطالعهٔ قوانین</button>
            <button type="button">رویهٔ بازگرداندن کالا</button>
          </>
        ),
      },
    })
    await placeButton()
    const form = within(review())
    const [accept, legalAge] = form.getAllByRole('checkbox')
    const links = form.getAllByRole('button', { name: /مطالعهٔ قوانین|رویهٔ بازگرداندن کالا/ })
    expect(links).toHaveLength(2)
    for (const link of links) {
      expect(accept!.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
      expect(
        link.compareDocumentPosition(legalAge!) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy()
    }
    // Reading them is no answer: the box stays unticked.
    await userEvent.setup().click(links[0]!)
    expect(accept).not.toBeChecked()
  })

  it('no sentences from the operator: no checkboxes, the slots’ links all the same', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({
      cart: onlineCart(),
      props: { termsLinks: <button type="button">مطالعهٔ قوانین</button> },
    })
    await placeButton()
    expect(within(review()).queryByRole('checkbox')).not.toBeInTheDocument()
    expect(within(review()).getByRole('button', { name: 'مطالعهٔ قوانین' })).toBeInTheDocument()
  })

  it('no sentences from the operator: no checkboxes', async () => {
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart() })
    await placeButton()
    expect(within(review()).queryByRole('checkbox')).not.toBeInTheDocument()
  })

  it('a double press places once', async () => {
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: () => new Promise((resolve) => (answer = resolve)),
    })
    renderCheckout({ cart: onlineCart() })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    await act(async () => {
      button.click()
      button.click()
      button.click()
    })
    await act(async () => {})
    expect(calls(mocks.bffFetch, PLACE)).toHaveLength(1)
    expect(button).toHaveAttribute('aria-busy', 'true')
    await act(async () => answer({ data: {}, msg: '', status: 500 }))
  })
})
