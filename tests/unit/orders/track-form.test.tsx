import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import {
  codeField,
  fill,
  mobileField,
  ok,
  refusal,
  renderTrack,
  serve,
  submit,
  throttled,
  trackCalls,
  tracked,
} from './track-support'

// The tracking form (order digest §3.1.8, §8.2): the order code (10 digits) and the buyer's or the
// receiver's mobile, Persian and Arabic digits normalised, checked here first, then ONE
// `POST order/track/` per press (20/min per IP: never a call per keystroke), never a native GET
// (the code and the number never reach the URL). The API's refusals: a 400 under its fields, a 404
// said plainly (the same for a wrong pair), a 429's wait with its `retry_after`.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/order/track/',
}))

beforeEach(() => {
  localStorage.clear()
  sessionStorage.clear()
  mocks.bffFetch.mockReset()
  window.history.replaceState(null, '', '/order/track/')
})
afterEach(() => vi.useRealTimers())

describe('what is sent', () => {
  it('normalises «۰۹۱۲…» and a Persian code: the API gets ASCII digits, 09… for the mobile', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await fill(user, { code: '۲۵۸۳۹۷۳۸۷۷', mobile: '۰۹۰۱ ۱۲۳ ۴۵۱۳' })
    await user.click(submit())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(1)
    expect(trackCalls(mocks.bffFetch)[0]![1]).toMatchObject({
      method: 'POST',
      body: { order_code: '2583973877', mobile_number: '09011234513' },
    })
  })

  it('Arabic digits, +98 and a code typed with spaces are taken too', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await fill(user, { code: '٢٥٨٣ ٩٧٣ ٨٧٧', mobile: '+98 901 123 4513' })
    await user.click(submit())
    expect(trackCalls(mocks.bffFetch)[0]![1]).toMatchObject({
      body: { order_code: '2583973877', mobile_number: '09011234513' },
    })
  })

  it('the fields: numeric code with no autofill, the mobile said to be the buyer’s or receiver’s', async () => {
    serve(mocks.bffFetch)
    await renderTrack()
    expect(codeField()).toHaveAttribute('inputmode', 'numeric')
    expect(codeField()).toHaveAttribute('autocomplete', 'off')
    expect(codeField()).toHaveAttribute('dir', 'ltr')
    expect(mobileField()).toHaveAttribute('inputmode', 'tel')
    expect(mobileField()).toHaveAccessibleDescription(/خریدار یا گیرنده/)
    expect(codeField().closest('form')).toHaveAttribute('method', 'post')
  })
})

describe('checked before anything is sent', () => {
  it('empty: both fields say what they need, the code takes the focus, nothing is sent', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await user.click(submit())
    expect(codeField()).toHaveAccessibleDescription('کد سفارش را وارد کنید')
    expect(mobileField()).toHaveAccessibleDescription(/شمارهٔ موبایل را وارد کنید/)
    await waitFor(() => expect(codeField()).toHaveFocus())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(0)
  })

  it('a code that is not 10 digits, and a landline: refused here with Persian messages', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await fill(user, { code: '۲۵۸۳۹۷۳۸۷', mobile: '02191000000' })
    await user.click(submit())
    expect(codeField()).toHaveAccessibleDescription('کد سفارش باید ۱۰ رقم باشد')
    expect(mobileField()).toHaveAccessibleDescription(/شمارهٔ موبایل معتبر نیست/)
    expect(trackCalls(mocks.bffFetch)).toHaveLength(0)
  })

  it('an edited field drops its message', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await user.click(submit())
    await user.type(codeField(), '1')
    expect(codeField()).not.toHaveAttribute('aria-invalid')
    expect(mobileField()).toHaveAttribute('aria-invalid', 'true')
  })
})

describe('one request per press', () => {
  it('a double press sends one; typing sends none', async () => {
    const user = userEvent.setup()
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, () => new Promise((resolve) => (answer = resolve)))
    await renderTrack()
    await fill(user)
    expect(trackCalls(mocks.bffFetch)).toHaveLength(0)
    await user.dblClick(submit())
    await user.click(submit())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(1)
    expect(submit()).toHaveAttribute('aria-busy', 'true')
    await act(async () => answer({ data: tracked('delivered'), msg: '', status: 200 }))
    expect(await screen.findByRole('heading', { name: /سفارش ۲۵۸۳۹۷۳۸۷۷/ })).toBeVisible()
  })

  it('the code and the number never reach the address', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch)
    await renderTrack()
    await fill(user)
    await user.click(submit())
    await screen.findByRole('heading', { name: /سفارش ۲۵۸۳۹۷۳۸۷۷/ })
    expect(window.location.href).not.toContain('2583973877')
    expect(window.location.href).not.toContain('09011234513')
    expect(window.location.search).toBe('')
  })
})

describe('the API’s answers', () => {
  it('400: each message under its field (the live body)', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => Promise.reject(refusal('bad_shapes')))
    await renderTrack()
    await fill(user)
    await user.click(submit())
    expect(await screen.findByText('کد باید دقیقاً ۱۰ رقم باشد.')).toBeVisible()
    expect(codeField()).toHaveAccessibleDescription('کد باید دقیقاً ۱۰ رقم باشد.')
    expect(mobileField()).toHaveAccessibleDescription(/یک شماره تماس معتبر وارد نمایید/)
  })

  it('404: «سفارشی با این شماره و کد پیدا نشد», the values kept, no result', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => Promise.reject(refusal('not_found')))
    await renderTrack()
    await fill(user)
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('سفارشی با این شماره و کد پیدا نشد')
    expect(codeField()).toHaveValue('2583973877')
    expect(mobileField()).toHaveValue('09011234513')
    expect(screen.queryByRole('list', { name: 'مراحل سفارش' })).toBeNull()
  })

  it('a not-found pair clears the result of the pair before', async () => {
    const user = userEvent.setup()
    let found = true
    serve(mocks.bffFetch, () =>
      found ? ok(tracked('delivered')) : Promise.reject(refusal('not_found')),
    )
    await renderTrack()
    await fill(user)
    await user.click(submit())
    expect(await screen.findByRole('list', { name: 'مراحل سفارش' })).toBeVisible()
    found = false
    await fill(user, { mobile: '09121234501' })
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('پیدا نشد')
    expect(screen.queryByRole('list', { name: 'مراحل سفارش' })).toBeNull()
  })

  it('429: the wait from retry_after on the button, nothing sent while it runs', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => Promise.reject(throttled(37)))
    await renderTrack()
    await fill(user)
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent(/بیش از حد/)
    expect(submit()).toHaveAttribute('aria-disabled', 'true')
    expect(submit()).toHaveAccessibleDescription(/۰۰:۳[۶۷]/)
    await user.click(submit())
    expect(trackCalls(mocks.bffFetch)).toHaveLength(1)
  })

  it('no answer: said, and the next press tries again', async () => {
    const user = userEvent.setup()
    let fail = true
    serve(mocks.bffFetch, () =>
      fail ? Promise.reject(ApiError.network()) : ok(tracked('processing')),
    )
    await renderTrack()
    await fill(user, { code: '7573331679' })
    await user.click(submit())
    expect(await screen.findByRole('alert')).toHaveTextContent('ارتباط با سرور برقرار نشد')
    fail = false
    await user.click(submit())
    expect(await screen.findByRole('heading', { name: /سفارش ۷۵۷۳۳۳۱۶۷۹/ })).toBeVisible()
  })
})
