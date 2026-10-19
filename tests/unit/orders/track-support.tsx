import { act, render, screen } from '@testing-library/react'
import type userEvent from '@testing-library/user-event'
import type { Mock } from 'vitest'
import { saveGuestOrder, type GuestOrder } from '@/features/orders/guest-orders'
import { TrackPage } from '@/features/orders/track/track-page'
import { ApiError } from '@/lib/api/errors'
import type { OrderTrackingResult } from '@/lib/api/types/order-detail'
import { clientProviders } from '../support/providers'
import live from '../../fixtures/order-track.json'

// What the tracking page's tests share: the live answers of `POST order/track/` (2026-10-18,
// tests/fixtures/order-track.json: demo orders read with their buyer's number), the API through
// the test file's mocked `bffFetch` (`order/track/` answers from `answer`; any other path never
// answers), the page as the browser renders it, and the form filled in as a visitor does.

export const TRACK = 'order/track/'

type Live = keyof typeof live
export const tracked = (name: Live, changes: Partial<OrderTrackingResult> = {}) => ({
  ...(structuredClone(live[name].body.data) as OrderTrackingResult),
  ...changes,
})

export const ok = (data: unknown) => Promise.resolve({ data, msg: '', status: 200 })

/** A live refusal (`not_found`, `bad_shapes`) as the client raises it. */
export const refusal = (name: 'not_found' | 'bad_shapes') =>
  ApiError.fromBody(live[name].status, live[name].body as unknown as Record<string, unknown>)

export const throttled = (retryAfter = 37) =>
  ApiError.fromBody(429, {
    msg: 'درخواست بیش از حد مجاز است.',
    code: 429,
    data: {
      type: 'client_error',
      errors: [{ code: 'throttled', detail: 'تعداد درخواست‌ها بیش از حد مجاز است.', attr: null }],
      retry_after: retryAfter,
    },
  })

export type Answer = (init: Record<string, unknown>) => Promise<unknown>

export function serve(bffFetch: Mock, answer: Answer = () => ok(tracked('delivered'))) {
  bffFetch.mockImplementation((path: string, init: Record<string, unknown> = {}) =>
    path === TRACK ? answer(init) : new Promise(() => {}),
  )
}

export const trackCalls = (bffFetch: Mock) => bffFetch.mock.calls.filter(([path]) => path === TRACK)

export const SUPPORT = { tel: '+982191000000', shown: '۰۲۱ ۹۱۰۰ ۰۰۰۰' }

export async function renderTrack({ hasSession = false } = {}) {
  const { wrapper } = clientProviders({ hasSession })
  const view = render(<TrackPage support={SUPPORT} />, { wrapper })
  await act(async () => {})
  return view
}

export const codeField = () => screen.getByRole('textbox', { name: /کد سفارش/ })
export const mobileField = () => screen.getByRole('textbox', { name: /شمارهٔ موبایل/ })
export const submit = () => screen.getByRole('button', { name: 'پیگیری سفارش' })

export async function fill(
  user: ReturnType<typeof userEvent.setup>,
  { code = '2583973877', mobile = '09011234513' }: { code?: string; mobile?: string } = {},
) {
  await user.clear(codeField())
  if (code) await user.type(codeField(), code)
  await user.clear(mobileField())
  if (mobile) await user.type(mobileField(), mobile)
}

/** A guest order kept on this device, as the checkout keeps it. */
export const keepGuestOrder = (changes: Partial<GuestOrder> = {}) =>
  saveGuestOrder({
    orderCode: '3067562358',
    linkToken: 'tokenForTheAwaitingOrder000000000000000001',
    expiresAt: '2026-10-21T15:00:00+03:30',
    A: 53_790_000,
    D: 0,
    total: 53_790_000,
    placedAt: '2026-10-18T15:00:00+03:30',
    ...changes,
  })
