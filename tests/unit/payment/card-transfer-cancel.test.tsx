import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import {
  calls,
  CANCEL,
  fillReceipt,
  ok,
  RECEIPT,
  renderTransfer,
  serve,
  stubTransferApis,
  submitButton,
} from './card-transfer-support'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'

// «انصراف» before a receipt (order digest §3.2.6, §5.7 step 6): a confirmation that starts on
// «بازگشت» and says the «پرداخت ناموفق» SMS; one cancel however fast the presses; then back to
// the order's route choice (its link page, a full load) when this device can find it, else said
// here. After a receipt: 409 `payment_under_review`, explained. Held while a receipt is on its way.

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

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
  mocks.probe.mockResolvedValue({ ok: true, width: 1080, height: 1920 })
})

const keepToken = () =>
  savePending(PAYMENT_UUID, {
    kind: 'order',
    orderCode: '1411635340',
    linkToken: LINK_TOKEN,
    route: 'card_transfer',
    amount: 1_049_000,
    startedAt: Date.now(),
  })

async function openDialog() {
  const user = userEvent.setup()
  await renderTransfer()
  await user.click(screen.getByRole('button', { name: 'انصراف از کارت به کارت' }))
  const dialog = await screen.findByRole('dialog', { name: /انصراف می‌دهید/ })
  return { user, dialog }
}

describe('cancel before a receipt', () => {
  it('asks first, starting on «بازگشت», and says the SMS and not to cancel once paid', async () => {
    serve(mocks.bffFetch)
    const { user, dialog } = await openDialog()
    expect(screen.getByRole('button', { name: 'بازگشت' })).toHaveFocus()
    expect(dialog).toHaveAccessibleDescription(/پیامک «پرداخت ناموفق»/)
    expect(dialog).toHaveTextContent('اگر مبلغ را واریز کرده‌اید انصراف ندهید')
    await user.click(screen.getByRole('button', { name: 'بازگشت' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(calls(mocks.bffFetch, CANCEL)).toHaveLength(0)
  })

  it('cancels once, then goes back to the order’s route choice (its link page)', async () => {
    keepToken()
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, { [CANCEL]: () => new Promise((resolve) => (answer = resolve)) })
    const { user } = await openDialog()
    const confirm = screen.getByRole('button', { name: 'انصراف از پرداخت' })
    await user.dblClick(confirm)
    expect(calls(mocks.bffFetch, CANCEL)).toHaveLength(1)
    await act(async () => answer({ data: cancelled.data, msg: cancelled.msg, status: 200 }))
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith(`/order/pay/${LINK_TOKEN}/`))
    // The cancelled attempt's pending entry is gone (its uuid leads nowhere now).
    expect(getPending(PAYMENT_UUID)).toBeNull()
  })

  it('no route choice this device can find: said here', async () => {
    serve(mocks.bffFetch, { [CANCEL]: () => ok(cancelled.data) })
    const { user } = await openDialog()
    await user.click(screen.getByRole('button', { name: 'انصراف از پرداخت' }))
    expect(
      await screen.findByRole('heading', { level: 1, name: 'پرداخت کارت به کارت لغو شد' }),
    ).toHaveFocus()
    expect(mocks.loadPage).not.toHaveBeenCalled()
  })

  it('a receipt already in the queue (409 payment_under_review): explained, the outcome', async () => {
    serve(mocks.bffFetch, {
      [CANCEL]: () =>
        Promise.reject(
          new ApiError({
            status: 409,
            code: 'payment_under_review',
            detail: 'رسید این پرداخت در حال بررسی است.',
          }),
        ),
    })
    const { user } = await openDialog()
    await user.click(screen.getByRole('button', { name: 'انصراف از پرداخت' }))
    expect(await screen.findByText(/امکان انصراف نیست/)).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('رسید ثبت شد')
  })

  it('another account’s attempt (403): said in the dialog, never offered again', async () => {
    serve(mocks.bffFetch, {
      [CANCEL]: () => Promise.reject(new ApiError({ status: 403, code: 'payment_forbidden' })),
    })
    const { user, dialog } = await openDialog()
    await user.click(screen.getByRole('button', { name: 'انصراف از پرداخت' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('از حساب کاربری دیگری آغاز شده')
    expect(screen.queryByRole('button', { name: 'انصراف از پرداخت' })).toBeNull()
    expect(dialog).toBeInTheDocument()
  })

  it('held while a receipt is on its way', async () => {
    serve(mocks.bffFetch, { [RECEIPT]: () => new Promise(() => {}) })
    const user = userEvent.setup()
    await renderTransfer()
    await fillReceipt(user)
    await user.click(submitButton())
    const cancel = screen.getByRole('button', { name: 'انصراف از کارت به کارت' })
    await waitFor(() => expect(cancel).toHaveAttribute('aria-disabled', 'true'))
    await user.click(cancel)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
