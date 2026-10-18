import { act, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { addressCart, option, unavailableBody } from './fixtures'
import { answerChosen, list, renderSection, selects, serve } from './shipping-support'

// The option chosen for the shopper while none is chosen (controller ruling, Task 2 fix round
// 1): the operator's default, i.e. the first option in the API's order that is available and
// whose sender pays; never a door-paid fare (پس‌کرایه) and never COD; none such, nothing is
// chosen and the shopper is asked. A refused default gives way to the next one; a throttled one
// is tried again after the wait; any other failure stops choosing (no loop).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), announce: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/components/ui/live-announcer', () => ({
  announce: mocks.announce,
  LiveAnnouncer: () => null,
}))

stubBrowserApis()

const chosenCodes = () => selects(mocks.bffFetch).map((body) => body.code)
/** Lets the page settle (effects, answers): nothing more is sent meanwhile. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 50)))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.announce.mockReset()
})

describe('ShippingSection’s default choice', () => {
  it('the operator’s default (first available, sender-paid, in the API’s order), never COD', async () => {
    serve(mocks.bffFetch, { cart: addressCart(), select: answerChosen })
    renderSection(addressCart())
    await waitFor(() =>
      expect(selects(mocks.bffFetch)).toEqual([{ code: 'peyk-tehran', cash_on_delivery: false }]),
    )
    await waitFor(() =>
      expect(mocks.announce).toHaveBeenCalledWith(
        expect.stringContaining('روش ارسال پیش\u{200C}فرض فروشگاه'),
      ),
    )
  })

  it('a cheaper door-paid option listed first is skipped', async () => {
    const options = list(option('tipax'), option('post-sefareshi'))
    serve(mocks.bffFetch, { cart: addressCart(), options, select: answerChosen })
    renderSection(addressCart())
    await waitFor(() => expect(chosenCodes()).toEqual(['post-sefareshi']))
  })

  it('only door-paid options: nothing is chosen, the shopper is asked', async () => {
    const options = list(option('tipax'), option('bar-sangin'))
    serve(mocks.bffFetch, { cart: addressCart(), options, select: answerChosen })
    renderSection(addressCart())
    expect(await screen.findByText('یک روش ارسال انتخاب کنید.')).toBeInTheDocument()
    await settle()
    expect(chosenCodes()).toEqual([])
  })

  it('a refused default (no longer available) gives way to the next sender-paid option', async () => {
    serve(mocks.bffFetch, {
      cart: addressCart(),
      select: (body) =>
        body.code === 'peyk-tehran'
          ? Promise.reject(ApiError.fromBody(400, unavailableBody()))
          : answerChosen(body),
    })
    renderSection(addressCart())
    await waitFor(() => expect(chosenCodes()).toEqual(['peyk-tehran', 'post-pishtaz']))
  })

  it('a throttled default (429) is tried again once the wait is over, not skipped', async () => {
    let calls = 0
    serve(mocks.bffFetch, {
      cart: addressCart(),
      select: (body) =>
        calls++ === 0
          ? Promise.reject(
              new ApiError({ status: 429, code: 'throttled', detail: 'صبر کنید.', retryAfter: 1 }),
            )
          : answerChosen(body),
    })
    renderSection(addressCart())
    expect(await screen.findByRole('alert')).toHaveTextContent('لطفاً کمی بعد دوباره تلاش کنید.')
    await waitFor(() => expect(chosenCodes()).toEqual(['peyk-tehran', 'peyk-tehran']), {
      timeout: 3000,
    })
  })

  it('any other failure stops choosing (no loop): its reason is said, the shopper chooses', async () => {
    serve(mocks.bffFetch, {
      cart: addressCart(),
      select: () => Promise.reject(new ApiError({ status: 500, code: 'error', detail: 'خطا.' })),
    })
    renderSection(addressCart())
    expect(await screen.findByRole('alert')).toHaveTextContent('خطا.')
    await settle()
    expect(chosenCodes()).toEqual(['peyk-tehran'])
  })
})
