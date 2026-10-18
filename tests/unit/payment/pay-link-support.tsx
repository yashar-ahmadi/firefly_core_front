import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import type { Mock } from 'vitest'
import { PayLinkPage } from '@/features/payment/pay-link-page'
import { FeatureProvider, type FeatureMap } from '@/features/settings/feature-context'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { clientProviders } from '../support/providers'
import { catalog, LINK_TOKEN, wallet } from './fixtures'
import { payLink } from './link-fixtures'

// What the payment link page's tests share: the island rendered as the server hands it over
// (the order, the server's catalog, the support line), the API through the test file's mocked
// `bffFetch` (the routes given answer their paths; the rest never answers).

export const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
export const LINK_READ = `order/pay/${LINK_TOKEN}/`
export const LINK_CANCEL = `order/pay/${LINK_TOKEN}/cancel/`

export const ok = (data: unknown, status = 200, msg = 'درخواست با موفقیت انجام شد.') => ({
  data,
  msg,
  status,
})

export type Route = (body: unknown, init: { idempotencyKey?: string }) => Promise<unknown>

export function serve(bffFetch: Mock, routes: Record<string, Route> = {}) {
  bffFetch.mockImplementation(
    (path: string, init: { body?: unknown; idempotencyKey?: string } = {}) => {
      if (path === 'wallet/') return Promise.resolve(ok(wallet()))
      const route = routes[path]
      return route ? route(init.body, init) : new Promise(() => {})
    },
  )
}

export function renderLink({
  link = payLink(),
  hasSession = false,
  features = {},
}: { link?: OrderPaymentLink; hasSession?: boolean; features?: Partial<FeatureMap> } = {}) {
  const { client, wrapper: Wrapper } = clientProviders({ hasSession })
  const wrapper = ({ children }: { children: ReactNode }) => (
    <FeatureProvider initial={features}>
      <Wrapper>{children}</Wrapper>
    </FeatureProvider>
  )
  const view = render(
    <PayLinkPage token={LINK_TOKEN} link={link} catalog={catalog()} supportPhone="+982191000000" />,
    { wrapper },
  )
  return { client, ...view }
}

export const keysOf = (mock: Mock) =>
  mock.mock.calls.map(([, init]) => (init as { idempotencyKey?: string }).idempotencyKey)

/** The routes' code loads lazily (the checkout's own payment step): wait for its press. */
export const routesReady = () =>
  screen.findByRole('button', { name: /^(?:پرداخت سفارش|تأیید سفارش)$/ })
