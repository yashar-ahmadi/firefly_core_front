import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import live from '../../fixtures/card-transfer-receipt-refusals.json'
import {
  calls,
  CARDS,
  cards,
  fillReceipt,
  ok,
  RECEIPT,
  renderTransfer,
  serve,
  status,
  STATUS,
  stubTransferApis,
  submitButton,
} from './card-transfer-support'

// Every refusal of the receipt upload, on the page (order digest §8.4, live bodies): the API's
// words under the fields it names (several at once), the cards read again when the chosen one is
// gone, the outcome for a second receipt, a new attempt for a closed one, a wait for the 10 an
// hour, the calm page for 403/404.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadPage: vi.fn(), probe: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/payment/x/' }))

stubTransferApis()

type Body = { code: number; data: Record<string, unknown> }
const refuse = (body: Body) => () =>
  Promise.reject(ApiError.fromBody(body.code, body as Record<string, unknown>))

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.probe.mockReset()
  mocks.probe.mockResolvedValue({ ok: true, width: 1080, height: 1920 })
})

async function sendWith(
  answer: () => Promise<unknown>,
  more: Record<string, () => Promise<unknown>> = {},
) {
  serve(mocks.bffFetch, { [RECEIPT]: answer, ...more })
  const user = userEvent.setup()
  await renderTransfer()
  await fillReceipt(user)
  await user.click(submitButton())
  return user
}

describe('the server’s refusals, mapped', () => {
  it('several field errors at once, each under its field; the payer’s name focused', async () => {
    await sendWith(refuse(live.validation))
    await waitFor(() => expect(screen.getByLabelText(/نام صاحب کارت مبدأ/)).toHaveFocus())
    expect(screen.getByLabelText(/نام صاحب کارت مبدأ/)).toHaveAccessibleDescription(
      /این مقدار لازم است/,
    )
    expect(screen.getByLabelText(/چهار رقم آخر کارت مبدأ/)).toHaveAccessibleDescription(
      /کد باید دقیقاً ۴ رقم باشد/,
    )
    expect(screen.getByRole('combobox', { name: 'روز' })).toHaveAccessibleDescription(
      /زمان واریز نمی‌تواند در آینده باشد/,
    )
    // `does_not_exist` on the card: the cards read again, the choice asked for again.
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2)
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(/دوباره انتخاب کنید/)
  })

  it.each([
    ['413 too large', live.image_too_large, /حجم تصویر نباید بیشتر از ۵ مگابایت باشد/],
    ['too small', live.image_too_small, /کمتر از حد مجاز/],
    ['not a JPEG, PNG or WEBP', live.image_invalid, /تصویر معتبر \(JPEG، PNG یا WEBP\) نیست/],
    ['not a picture at all (invalid_image)', live.invalid_image, /فایل تصویر معتبر نیست/],
  ])('%s: under the picture, which takes the focus', async (_, body, message) => {
    await sendWith(refuse(body as Body))
    const input = screen.getByLabelText(/تصویر رسید/)
    await waitFor(() => expect(input).toHaveFocus())
    expect(input).toHaveAccessibleDescription(message)
  })

  it('a card no longer active: the cards read again (the gone one dropped), chosen again', async () => {
    let read = 0
    const [mellat, saman] = cards().destination_cards
    await sendWith(
      () => Promise.reject(new ApiError({ status: 400, code: 'payment_destination_card_invalid' })),
      {
        [CARDS]: () =>
          ok(cards({ destination_cards: read++ === 0 ? [mellat!, saman!] : [saman!] })),
      },
    )
    await waitFor(() => expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2))
    expect(screen.queryByRole('radio', { name: /بانک ملت/ })).toBeNull()
    // One card left: chosen for the shopper, and said why.
    expect(screen.getByRole('radio', { name: /بانک سامان/ })).toBeChecked()
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(/دیگر پذیرفته نمی‌شود/)
  })

  it('a card no longer active and the cards cannot be read again: said so, never "read again"', async () => {
    let read = 0
    await sendWith(
      () => Promise.reject(new ApiError({ status: 400, code: 'payment_destination_card_invalid' })),
      {
        [CARDS]: () => (read++ === 0 ? ok(cards()) : Promise.reject(ApiError.network())),
      },
    )
    await waitFor(() => expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2))
    const group = screen.getByRole('radiogroup')
    await waitFor(() => expect(group).toHaveAccessibleDescription(/دوباره خوانده نشد/))
    expect(group).not.toHaveAccessibleDescription(/فهرست کارت‌ها دوباره خوانده شد/)
  })

  it('409 already submitted: «رسید قبلاً ثبت شده است» and the outcome', async () => {
    await sendWith(refuse(live.already_submitted), {
      [STATUS]: (() => {
        let reads = 0
        return () => ok(status({ status: reads++ === 0 ? 'pending' : 'awaiting_review' }))
      })(),
    })
    expect(
      await screen.findByRole('heading', { level: 1, name: 'رسید قبلاً ثبت شده است' }),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
  })

  it('payment_target_invalid (the attempt closed): a new attempt', async () => {
    await sendWith(refuse(live.target_invalid))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'این پرداخت بسته شده است' }),
    ).toBeVisible()
  })

  it('429 (10 an hour): said, the button held for the wait, the form kept', async () => {
    await sendWith(() =>
      Promise.reject(new ApiError({ status: 429, code: 'throttled', retryAfter: 600 })),
    )
    expect(await screen.findByRole('alert')).toHaveTextContent('بیش از حد مجاز')
    expect(screen.getByText(/زمان باقی‌مانده تا تلاش دوباره: ۱۰:۰۰|۰۹:۵۹/)).toBeVisible()
    expect(submitButton()).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByLabelText(/نام صاحب کارت مبدأ/)).toHaveValue('سارا احمدی')
  })

  it.each([
    ['404', refuse(live.not_found), 'این پرداخت پیدا نشد'],
    [
      '403',
      () => Promise.reject(new ApiError({ status: 403, code: 'payment_forbidden' })),
      'این پرداخت از حساب کاربری دیگری است',
    ],
  ])('%s: the calm page', async (_, answer, title) => {
    await sendWith(answer)
    expect(await screen.findByRole('heading', { level: 1, name: title })).toBeVisible()
  })
})
