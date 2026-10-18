import { render } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { PaymentIntent } from '@/lib/api/types/payment'
import { handoff, PAYMENT_UUID } from '../payment/fixtures'
import { clientProviders } from '../support/providers'
import { refusal } from './fixtures'

// What the wallet's tests share: rendering with the session and the feature switches, the API
// through the test file's mocked `bffFetch`, and what the top-up and withdrawal writes sent.

export function renderWallet(
  node: ReactNode,
  {
    features = {},
    hasSession = true,
  }: { features?: Partial<FeatureMap>; hasSession?: boolean } = {},
) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={features}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  return { client, ...render(node, { wrapper }) }
}

export const ok = (data: unknown, msg = 'درخواست با موفقیت انجام شد.', status = 200) =>
  Promise.resolve({ data, msg, status })

/** A refusal of the API (its envelope), as `bffFetch` rejects with it. */
export function refuse(status: number, code: string, detail = 'رد شد.', extra = {}, attr = null) {
  return Promise.reject(
    ApiError.fromBody(status, {
      msg: 'خطا',
      code: status,
      data: {
        type: status === 400 ? 'validation_error' : 'client_error',
        errors: [{ code, detail, attr }],
        ...extra,
      },
    }),
  )
}

/** A refusal captured live (tests/fixtures/wallet-refusals.json). */
export function refuseLive(name: Parameters<typeof refusal>[0]) {
  const { status, body } = refusal(name)
  return Promise.reject(ApiError.fromBody(status, body as Record<string, unknown>))
}

export type Route = (init: Record<string, unknown>) => Promise<unknown>

/** Each path's answers; any other path never answers. */
export function serve(bffFetch: Mock, routes: Record<string, Route> = {}) {
  bffFetch.mockImplementation((path: string, init: Record<string, unknown> = {}) => {
    const route = routes[path]
    return route ? route(init) : new Promise(() => {})
  })
}

export const calls = (bffFetch: Mock, path: string) =>
  bffFetch.mock.calls.filter(([called]) => called === path)

/** The bodies of the top-ups sent. */
export const topUpSent = (bffFetch: Mock) =>
  calls(bffFetch, 'wallet/top-up/').map(([, init]) => (init as { body: unknown }).body)

/** The Idempotency-Keys of the top-ups sent, in order. */
export const topUpKeys = (bffFetch: Mock) =>
  calls(bffFetch, 'wallet/top-up/').map(
    ([, init]) => (init as { idempotencyKey?: string }).idempotencyKey,
  )

/** A top-up's 201 (digest §3.3.3: `wallet_topup`, no order, a handoff). */
export function topUpIntent(amount = 100_000) {
  const intent: PaymentIntent = {
    payment: {
      uuid: PAYMENT_UUID,
      applies_to: 'wallet_topup',
      method: 'bank_gateway',
      status: 'pending',
      amount,
      order_code: null,
      failure_reason: '',
      settled_at: null,
    },
    status: 'pending',
    handoff: handoff(),
    destination_cards: [],
    delivery_collection: null,
  }
  return ok(intent, 'ایجاد شد.', 201)
}

/** The bodies of the withdrawal requests sent. */
export const withdrawalsSent = (bffFetch: Mock) =>
  calls(bffFetch, 'wallet/withdrawal/request/').map(([, init]) => (init as { body: unknown }).body)
