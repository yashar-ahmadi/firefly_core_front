import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { Mock } from 'vitest'
import { CardTransferPage } from '@/features/payment/card-transfer/card-transfer-page'
import type { CardTransferInstruction, PaymentStatusInfo } from '@/lib/api/types/payment'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import instruction from '../../fixtures/card-transfer-instruction.json'
import review from '../../fixtures/payment-status-review.json'
import { PAYMENT_UUID } from './fixtures'

// What the card-transfer page's tests share: the API through the test file's mocked `bffFetch`
// (each path answers from `routes`, the status and the cards from the live fixtures by default;
// any other path never answers), the page as the browser renders it, and a receipt form filled
// in with a picture whose measuring the test decides (`probeImage` is mocked by the test file).

/** What jsdom lacks: Radix's ResizeObserver, and object URLs for the picture's preview. */
export function stubTransferApis() {
  stubBrowserApis()
  URL.createObjectURL = () => 'blob:receipt-preview'
  URL.revokeObjectURL = () => {}
}

export const STATUS = `payment/${PAYMENT_UUID}/status/`
export const CARDS = `payment/${PAYMENT_UUID}/card-transfer/`
export const RECEIPT = `payment/${PAYMENT_UUID}/card-transfer/receipt/`
export const CANCEL = `payment/${PAYMENT_UUID}/cancel/`

export const ok = (data: unknown, status = 200) => Promise.resolve({ data, msg: '', status })

export const status = (changes: Partial<PaymentStatusInfo> = {}): PaymentStatusInfo => ({
  ...(review.data as PaymentStatusInfo),
  status: 'pending',
  ...changes,
})

export const cards = (changes: Partial<CardTransferInstruction> = {}): CardTransferInstruction => ({
  ...(structuredClone(instruction.data) as CardTransferInstruction),
  ...changes,
})

export type Route = (init: Record<string, unknown>) => Promise<unknown>

export function serve(bffFetch: Mock, routes: Record<string, Route> = {}) {
  const all: Record<string, Route> = {
    [STATUS]: () => ok(status()),
    [CARDS]: () => ok(cards()),
    ...routes,
  }
  bffFetch.mockImplementation((path: string, init: Record<string, unknown> = {}) => {
    const route = all[path]
    return route ? route(init) : new Promise(() => {})
  })
}

export const calls = (bffFetch: Mock, path: string) =>
  bffFetch.mock.calls.filter(([called]) => called === path)

export const SUPPORT = { tel: '+982191000000', shown: '۰۲۱ ۹۱۰۰ ۰۰۰۰' }

export async function renderTransfer({
  hasSession = false,
  instruction: html,
}: { hasSession?: boolean; instruction?: string | null } = {}) {
  const { client, wrapper } = clientProviders({ hasSession })
  const view = render(
    <CardTransferPage uuid={PAYMENT_UUID} instruction={html} support={SUPPORT} />,
    { wrapper },
  )
  // The status and the cards' answers.
  await act(async () => {})
  return { client, ...view }
}

/** A picture file of `size` bytes and `type`. */
export const picture = (size = 200_000, type = 'image/png', name = 'receipt.png') =>
  new File([new Uint8Array(size)], name, { type })

/** Fills the form in completely (one card chosen when there are two). */
export async function fillReceipt(
  user: ReturnType<typeof userEvent.setup>,
  { file = picture(), digits = '۱۲۳۴' }: { file?: File; digits?: string } = {},
) {
  await user.upload(screen.getByLabelText(/تصویر رسید/), file)
  await user.type(screen.getByLabelText(/نام صاحب کارت مبدأ/), 'سارا احمدی')
  await user.type(screen.getByLabelText(/چهار رقم آخر کارت مبدأ/), digits)
  const radios = screen.queryAllByRole('radio')
  if (radios.length > 1) await user.click(radios[0]!)
}

export const submitButton = () => screen.getByRole('button', { name: /ثبت رسید|در حال ارسال/ })
