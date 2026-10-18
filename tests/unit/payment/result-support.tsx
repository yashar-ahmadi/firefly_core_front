import { act, render } from '@testing-library/react'
import type { Mock } from 'vitest'
import type { PaymentStatusInfo } from '@/lib/api/types/payment'
import { PaymentResultPage } from '@/features/payment/result-page'
import { clientProviders } from '../support/providers'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import { PAYMENT_UUID, wallet } from './fixtures'

// What the result page's tests share: the bank's return in the address, the page as the browser
// renders it, and the API through the test file's mocked `bffFetch` (the status endpoint answers
// from `answers` in turn, the last one repeated; other routes as given; the rest never answers).

export const STATUS = `payment/${PAYMENT_UUID}/status/`

/** A status read (digest §2 `PaymentStatusInfo`), from the live cancel answer's shape. */
export const status = (changes: Partial<PaymentStatusInfo> = {}): PaymentStatusInfo => ({
  ...(cancelled.data as PaymentStatusInfo),
  method: 'bank_gateway',
  status: 'pending',
  failure_reason: '',
  ...changes,
})

export const ok = (data: unknown, status = 200) => ({ data, msg: '', status })

export type Answer = PaymentStatusInfo | Error

export function serve(
  bffFetch: Mock,
  answers: Answer[],
  routes: Record<string, (init: { idempotencyKey?: string }) => Promise<unknown>> = {},
) {
  let read = 0
  bffFetch.mockImplementation((path: string, init: { idempotencyKey?: string } = {}) => {
    if (path === STATUS) {
      const answer = answers[Math.min(read++, answers.length - 1)]!
      return answer instanceof Error ? Promise.reject(answer) : Promise.resolve(ok(answer))
    }
    if (path === 'wallet/') return Promise.resolve(ok(wallet()))
    const route = routes[path]
    return route ? route(init) : new Promise(() => {})
  })
}

export const statusReads = (bffFetch: Mock) =>
  bffFetch.mock.calls.filter(([path]) => path === STATUS)

/** The bank's return: the address the backend's 302 leads to. */
export function arrive(query: string) {
  window.history.replaceState(null, '', `/payment/callback/${query}`)
}

export async function renderResult({ hasSession = false } = {}) {
  const { client, wrapper } = clientProviders({ hasSession })
  const view = render(
    <PaymentResultPage support={{ tel: '+982191000000', shown: '۰۲۱ ۹۱۰۰ ۰۰۰۰' }} />,
    { wrapper },
  )
  // The first status read's answer.
  await act(async () => {})
  return { client, ...view }
}
