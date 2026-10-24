import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TopUpForm } from '@/features/wallet/top-up-form'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { balance } from './fixtures'
import { refuse, renderWallet, serve, topUpSent, type Route } from './wallet-support'

// A top-up a gateway refuses for its amount (`gateway_amount_not_supported`, under its floor or
// over its ceiling; order digest §3.3.3, §5.4). It used to withdraw that gateway for the page,
// as a gateway the shop cannot use at all (Plan 4 final review, carried to Plan 5 Task 9): now
// it is left out at that amount only. Another gateway takes the next press; with none left the
// bound is said under the amount and nothing is sent until the amount changes, which offers the
// refused gateway again.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  localStorage.clear()
})

const FLOOR = 'مبلغ پرداخت از حداقل مجاز این درگاه (۲۰۰٬۰۰۰ تومان) کمتر است.'
const tooLow = () => refuse(400, 'gateway_amount_not_supported', FLOOR)
const amount = () => screen.getByRole('textbox', { name: /مبلغ شارژ/ })
const submit = () => screen.getByRole('button', { name: /^(افزایش موجودی|در حال)/ })

async function open(answers: Route[]) {
  serve(mocks.bffFetch, {
    'wallet/top-up/': (init) => answers.shift()!(init),
    'payment/gateway/list/': () => new Promise(() => {}),
  })
  renderWallet(
    <TopUpForm
      wallet={balance()}
      catalog={catalog()}
      supportPhone="+982191000000"
      refreshWallet={async () => balance()}
    />,
  )
  const user = userEvent.setup()
  await user.type(amount(), '100000')
  await user.click(submit())
  return user
}

describe('a top-up a gateway refuses for its amount', () => {
  it('the other gateway takes the next press; another amount offers the refused one again', async () => {
    const user = await open([tooLow, () => new Promise(() => {})])
    expect(await screen.findByRole('alert')).toHaveTextContent(
      `${FLOOR} برای پرداخت با زیبال دوباره «افزایش موجودی» را بزنید.`,
    )
    await user.click(submit())
    // Another amount: both gateways again (the chooser, the shop's default chosen).
    await user.clear(amount())
    await user.type(amount(), '300000')
    expect(screen.getByRole('button', { name: 'تغییر درگاه' })).toBeInTheDocument()
    expect(topUpSent(mocks.bffFetch)).toEqual([
      { amount: 100_000, gateway_code: 'ZARINPAL' },
      { amount: 100_000, gateway_code: 'ZIBAL' },
    ])
  })

  it('every gateway refused at the amount: the bound under it, nothing sent until it changes', async () => {
    const user = await open([tooLow, tooLow, () => new Promise(() => {})])
    await screen.findByRole('alert')
    await user.click(submit())
    await waitFor(() =>
      expect(amount()).toHaveAccessibleDescription(new RegExp(FLOOR.slice(0, 20))),
    )
    // The same amount again: nothing to send it with.
    await user.click(submit())
    expect(topUpSent(mocks.bffFetch)).toHaveLength(2)
    expect(amount()).toHaveFocus()
    // Another amount: the shop's default again.
    await user.clear(amount())
    await user.type(amount(), '300000')
    await user.click(submit())
    expect(topUpSent(mocks.bffFetch).at(-1)).toEqual({ amount: 300_000, gateway_code: 'ZARINPAL' })
  })

  it('back to the amount every gateway refused: a press says so under it, and sends nothing', async () => {
    const user = await open([tooLow, tooLow])
    await screen.findByRole('alert')
    await user.click(submit())
    await waitFor(() => expect(topUpSent(mocks.bffFetch)).toHaveLength(2))
    // Another amount, then the refused one again (its bound was cleared with the first change).
    await user.clear(amount())
    await user.type(amount(), '300000')
    await user.clear(amount())
    await user.type(amount(), '100000')
    expect(amount()).not.toHaveAccessibleDescription(new RegExp(FLOOR.slice(0, 20)))
    await user.click(submit())
    expect(amount()).toHaveAccessibleDescription(
      /هیچ درگاهی این مبلغ را نمی\u{200C}پذیرد؛ مبلغ دیگری وارد کنید\./u,
    )
    expect(amount()).toHaveFocus()
    expect(topUpSent(mocks.bffFetch)).toHaveLength(2)
  })
})
