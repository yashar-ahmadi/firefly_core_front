import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import {
  calls,
  fillReceipt,
  ok,
  picture,
  RECEIPT,
  renderTransfer,
  serve,
  stubTransferApis,
  submitButton,
} from './card-transfer-support'

// The receipt form (order digest §5.7 step 3; Review Focus #4): every rule caught before anything
// is sent, in Persian, under its field, the first in error focused; a complete receipt sent once as
// multipart (the digits normalised, `paid_at` at +03:30); the BFF's `503 upload_retry` keeps every
// field and the chosen file for the press again.

const mocks = vi.hoisted(() => ({
  bffFetch: vi.fn(),
  loadPage: vi.fn(),
  probe: vi.fn(),
  announce: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
const router = { push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }
vi.mock('next/navigation', () => ({ useRouter: () => router, usePathname: () => '/payment/x/' }))

stubTransferApis()

const RECEIPT_201 = {
  uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
  status: 'awaiting_review',
  paid_at: '2026-10-18T09:30:00+03:30',
  image_thumbnail: '/media/receipts/x.jpg',
  rejection_reason_code: null,
  rejection_reason: '',
  reviewed_at: null,
}

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.probe.mockReset()
  mocks.announce.mockReset()
  mocks.probe.mockResolvedValue({ ok: true, width: 1080, height: 1920 })
  serve(mocks.bffFetch, { [RECEIPT]: () => ok(RECEIPT_201, 201) })
})
afterEach(() => vi.useRealTimers())

const sentForm = (index = 0) => calls(mocks.bffFetch, RECEIPT)[index]![1].formData as FormData

describe('before anything is sent', () => {
  it('an empty form: every field says what it needs, the picture takes the focus', async () => {
    const user = userEvent.setup()
    await renderTransfer()
    await user.click(submitButton())
    const image = screen.getByLabelText(/تصویر رسید/)
    expect(image).toHaveFocus()
    expect(image).toHaveAccessibleDescription(/تصویر رسید را انتخاب کنید/)
    expect(screen.getByLabelText(/نام صاحب کارت مبدأ/)).toHaveAccessibleDescription(
      /نام صاحب کارت مبدأ را وارد کنید/,
    )
    expect(screen.getByLabelText(/چهار رقم آخر کارت مبدأ/)).toHaveAccessibleDescription(
      /چهار رقم آخر کارت مبدأ را وارد کنید/,
    )
    expect(screen.getByRole('radiogroup')).toHaveAccessibleDescription(
      /کارتی را که به آن واریز کرده‌اید انتخاب کنید/,
    )
    expect(calls(mocks.bffFetch, RECEIPT)).toHaveLength(0)
  })

  it('a 6 MiB picture: «حجم تصویر نباید بیشتر از ۵ مگابایت باشد», as soon as it is chosen', async () => {
    const user = userEvent.setup()
    await renderTransfer()
    await user.upload(screen.getByLabelText(/تصویر رسید/), picture(6 * 1024 * 1024))
    expect(screen.getByLabelText(/تصویر رسید/)).toHaveAccessibleDescription(
      /حجم تصویر نباید بیشتر از ۵ مگابایت باشد/,
    )
    // The preview of the shopper's own file, with its alt text.
    expect(screen.getByRole('img', { name: 'پیش‌نمایش تصویر رسید انتخاب‌شده' })).toBeVisible()
  })

  it('a GIF is refused; a picture the browser cannot read: «فایل تصویر معتبر نیست»', async () => {
    const user = userEvent.setup({ applyAccept: false })
    await renderTransfer()
    const input = screen.getByLabelText(/تصویر رسید/)
    expect(input).toHaveAttribute('accept', 'image/jpeg,image/png,image/webp')
    await user.upload(input, picture(1000, 'image/gif', 'slip.gif'))
    expect(input).toHaveAccessibleDescription(/فقط تصویر JPEG، PNG یا WEBP/)
    mocks.probe.mockResolvedValue({ ok: false, reason: 'decode' })
    await user.upload(input, picture())
    expect(input).toHaveAccessibleDescription(/فایل تصویر معتبر نیست/)
    mocks.probe.mockResolvedValue({ ok: true, width: 200, height: 900 })
    await user.upload(input, picture())
    expect(input).toHaveAccessibleDescription(/دست‌کم ۳۰۰ پیکسل/)
  })

  it('a transfer time in the future is refused under the date and time', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true, now: new Date('2026-10-18T06:30:00Z') })
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    await renderTransfer()
    await fillReceipt(user)
    // 10:00 in Tehran now; 12:00 is two hours ahead.
    await user.selectOptions(screen.getByRole('combobox', { name: 'ساعت' }), '12')
    await user.click(submitButton())
    await waitFor(() => expect(screen.getByRole('combobox', { name: 'روز' })).toHaveFocus())
    expect(screen.getByRole('combobox', { name: 'ساعت' })).toHaveAccessibleDescription(
      /زمان واریز نمی‌تواند در آینده باشد/,
    )
    expect(calls(mocks.bffFetch, RECEIPT)).toHaveLength(0)
  })
})

describe('sending', () => {
  it('sends one multipart receipt («۱۲۳۴» as 1234, paid_at at +03:30); 201: in the review queue', async () => {
    const user = userEvent.setup()
    await renderTransfer()
    const file = picture()
    await fillReceipt(user, { file })
    await user.click(submitButton())
    const form = sentForm()
    expect(form.get('image')).toBe(file)
    expect(form.get('payer_name')).toBe('سارا احمدی')
    expect(form.get('payer_card_last_digits')).toBe('1234')
    expect(form.get('paid_at')).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:00\+03:30$/)
    expect(form.get('destination_card')).toBe('10001')
    expect(form.has('bank_reference')).toBe(false)
    expect(
      await screen.findByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' }),
    ).toHaveFocus()
    // Said once: by the focused heading, not by the live region as well.
    expect(mocks.announce).not.toHaveBeenCalledWith('رسید ثبت شد و در صف بررسی است')
    // A guest: tracking (the order cannot be paid or cancelled now).
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
  })

  it('the bank’s reference typed in Persian digits is sent in ASCII digits, trimmed', async () => {
    const user = userEvent.setup()
    await renderTransfer()
    await fillReceipt(user)
    await user.type(screen.getByLabelText(/شمارهٔ پیگیری بانک/), ' ۹۸۷۶۵۴ ')
    await user.click(submitButton())
    expect(sentForm().get('bank_reference')).toBe('987654')
  })

  it('signed in: the order’s page instead of tracking', async () => {
    const user = userEvent.setup()
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    expect(await screen.findByRole('link', { name: 'مشاهدهٔ سفارش' })).toHaveAttribute(
      'href',
      '/account/orders/1411635340/',
    )
  })

  it('a double click sends one receipt', async () => {
    const user = userEvent.setup()
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, { [RECEIPT]: () => new Promise((resolve) => (answer = resolve)) })
    await renderTransfer()
    await fillReceipt(user)
    await user.dblClick(submitButton())
    await user.click(submitButton())
    expect(calls(mocks.bffFetch, RECEIPT)).toHaveLength(1)
    expect(submitButton()).toHaveAttribute('aria-busy', 'true')
    await act(async () => answer({ data: RECEIPT_201, msg: '', status: 201 }))
    expect(await screen.findByText('رسید ثبت شد و در صف بررسی است')).toBeVisible()
  })

  it('503 upload_retry: «دوباره تلاش کنید», every field and the file kept; the press again sends', async () => {
    const user = userEvent.setup()
    let first = true
    serve(mocks.bffFetch, {
      [RECEIPT]: () => {
        if (!first) return ok(RECEIPT_201, 201)
        first = false
        return Promise.reject(new ApiError({ status: 503, code: 'upload_retry' }))
      },
    })
    await renderTransfer()
    const file = picture()
    await fillReceipt(user, { file })
    await user.type(screen.getByLabelText(/شمارهٔ پیگیری بانک/), '987654')
    await user.click(submitButton())
    expect(await screen.findByRole('alert')).toHaveTextContent('دوباره تلاش کنید')
    expect(screen.getByLabelText(/نام صاحب کارت مبدأ/)).toHaveValue('سارا احمدی')
    expect(screen.getByLabelText(/چهار رقم آخر کارت مبدأ/)).toHaveValue('۱۲۳۴')
    expect(screen.getByLabelText(/شمارهٔ پیگیری بانک/)).toHaveValue('987654')
    expect(screen.getAllByRole('radio')[0]).toBeChecked()
    expect(screen.getByRole('img', { name: /پیش‌نمایش تصویر رسید/ })).toBeVisible()
    await user.click(submitButton())
    expect(calls(mocks.bffFetch, RECEIPT)).toHaveLength(2)
    expect(sentForm(1).get('image')).toBe(file)
    expect(sentForm(1).get('bank_reference')).toBe('987654')
    expect(await screen.findByText('رسید ثبت شد و در صف بررسی است')).toBeVisible()
  })
})
