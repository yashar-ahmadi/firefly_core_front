import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { IntentError, startPayment } from '@/features/payment/api'
import { OpenAttempt } from '@/features/payment/open-attempt'
import { getPending, PENDING_KEY } from '@/features/payment/pending-payments'
import { TopUpForm } from '@/features/wallet/top-up-form'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { balance } from '../wallet/fixtures'
import { renderWallet, serve, topUpIntent } from '../wallet/wallet-support'
import { catalog, handoff, intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { bankAttempt } from './link-fixtures'

// A handoff the API gave with a URL that is no bank's (handoff-url.ts; Plan 4 final fix wave)
// becomes the existing «the bank did not answer» refusal wherever it arrives: an intent's answer
// (checkout, link page, «پرداخت دوباره»), a top-up's, an open attempt's «ادامه در …». Nothing is
// saved for the way back, nothing navigates (`goToBank` is never called with it).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

const UNSAFE = handoff({ url: 'javascript:alert(document.cookie)' })
const UNAVAILABLE = 'درگاه بانک پاسخ نداد؛ کمی بعد دوباره تلاش کنید.'

beforeEach(() => {
  vi.clearAllMocks()
  mocks.bffFetch.mockReset()
  stubBrowserApis()
  localStorage.clear()
})

describe('an intent answered with an unusable handoff', () => {
  it('is refused as the bank not answering (`gateway_unavailable`)', async () => {
    const answer = { ...intent('bank_gateway'), handoff: UNSAFE }
    mocks.bffFetch.mockResolvedValueOnce({ data: answer, msg: '', status: 201 })
    const error = await startPayment({
      door: { kind: 'link', token: LINK_TOKEN },
      route: 'bank_gateway',
      key: 'click-1',
    }).catch((caught: unknown) => caught)
    expect(error).toBeInstanceOf(IntentError)
    expect((error as IntentError).problem).toBe('gateway_unavailable')
  })

  it('an https handoff is the answer as it came', async () => {
    mocks.bffFetch.mockResolvedValueOnce({ data: intent('bank_gateway'), msg: '', status: 201 })
    const answer = await startPayment({
      door: { kind: 'link', token: LINK_TOKEN },
      route: 'bank_gateway',
      key: 'click-1',
    })
    expect(answer.handoff?.url).toBe(handoff().url)
  })
})

describe('a top-up answered with an unusable handoff', () => {
  it('the bank-unavailable sentence; no pending top-up, no bank', async () => {
    const created = (await topUpIntent()) as { data: Record<string, unknown> }
    serve(mocks.bffFetch, {
      'wallet/top-up/': () =>
        Promise.resolve({ ...created, data: { ...created.data, handoff: UNSAFE } }),
      'payment/gateway/list/': () => new Promise(() => {}),
    })
    renderWallet(
      <TopUpForm
        wallet={balance()}
        catalog={catalog()}
        supportPhone={null}
        refreshWallet={vi.fn(async () => balance())}
      />,
    )
    const user = userEvent.setup()
    await user.type(screen.getByRole('textbox', { name: /مبلغ شارژ/ }), '100000')
    await user.click(screen.getByRole('button', { name: /^افزایش موجودی/ }))
    expect(await screen.findByRole('alert')).toHaveTextContent(UNAVAILABLE)
    expect(mocks.goToBank).not.toHaveBeenCalled()
    expect(localStorage.getItem(PENDING_KEY)).toBeNull()
  })
})

describe('an open attempt whose handoff is unusable', () => {
  it('«ادامه در …»: the bank-unavailable sentence; nothing saved, no bank', async () => {
    const user = userEvent.setup()
    const { wrapper } = clientProviders()
    render(
      <OpenAttempt
        attempt={bankAttempt({ handoff: UNSAFE })}
        door={{ kind: 'link', token: LINK_TOKEN }}
        orderCode="1411635340"
        onResolved={vi.fn()}
      />,
      { wrapper },
    )
    const panel = screen.getByRole('region', { name: /پرداخت/ })
    await user.click(within(panel).getByRole('button', { name: 'ادامه در زرین پال' }))
    await waitFor(() => expect(within(panel).getByRole('alert')).toHaveTextContent(UNAVAILABLE))
    expect(mocks.goToBank).not.toHaveBeenCalled()
    expect(getPending(PAYMENT_UUID)).toBeNull()
  })
})
