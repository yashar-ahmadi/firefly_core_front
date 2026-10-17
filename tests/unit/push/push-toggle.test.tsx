import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PUSH_LABEL, PushToggle } from '@/features/push/push-toggle'
import { savePushState } from '@/features/push/push-storage'
import { ENABLE_FAILED } from '@/features/push/use-web-push'
import { pushProviders, stubPushBrowser, unstubPushBrowser, type PushBrowser } from './support'

// «دریافت اعلان در مرورگر» in the inbox's header: hidden without the shop's Firebase config, a
// note in a browser without web push, otherwise a switch (off, on, blocked in the browser's
// settings, on its way) that asks the browser's permission only when the visitor turns it on.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadMessaging: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/push/firebase', () => ({ loadMessaging: mocks.loadMessaging }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

let browser: PushBrowser

beforeEach(() => {
  vi.clearAllMocks()
  localStorage.clear()
  browser = stubPushBrowser()
  mocks.bffFetch.mockResolvedValue({ data: {}, msg: '', status: 201 })
  mocks.loadMessaging.mockResolvedValue({
    getToken: async () => 'token',
    deleteToken: async () => {},
    onMessage: () => () => {},
  })
})

afterEach(() => {
  unstubPushBrowser()
  vi.restoreAllMocks()
})

function toggle(options: Parameters<typeof pushProviders>[0] = {}) {
  return render(<PushToggle />, { wrapper: pushProviders(options).wrapper })
}
const pushSwitch = () => screen.getByRole('switch', { name: PUSH_LABEL })

describe('PushToggle', () => {
  it('renders nothing without the shop’s Firebase config', () => {
    const { container } = toggle({ firebase: null })
    expect(container).toBeEmptyDOMElement()
  })

  it('a browser without web push: a one-line note instead, with the iPhone’s way', () => {
    unstubPushBrowser()
    const { unmount } = toggle()
    expect(screen.queryByRole('switch')).toBeNull()
    expect(screen.getByText('این مرورگر اعلان‌های وب را پشتیبانی نمی‌کند.')).toBeVisible()
    unmount()
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 Version/18.6 Mobile/15E148 Safari/604.1',
    )
    toggle()
    expect(screen.getByText(/«افزودن به صفحهٔ اصلی» نصب کنید/)).toBeVisible()
  })

  it('off: the switch is off and nothing is asked until it is turned on', () => {
    toggle()
    expect(pushSwitch()).not.toBeChecked()
    expect(pushSwitch()).toBeEnabled()
    expect(pushSwitch()).toHaveAccessibleDescription(/حتی وقتی سایت بسته است/)
    expect(browser.requestPermission).not.toHaveBeenCalled()
  })

  it('on: the switch is on', () => {
    browser = stubPushBrowser({ permission: 'granted' })
    savePushState({ token: 'token', checkedAt: Date.now() })
    toggle()
    expect(pushSwitch()).toBeChecked()
    expect(pushSwitch()).toHaveAccessibleDescription(/روشن است/)
  })

  it('blocked in the browser’s settings: off, disabled, and how to allow it there', () => {
    stubPushBrowser({ permission: 'denied' })
    toggle()
    expect(pushSwitch()).not.toBeChecked()
    expect(pushSwitch()).toBeDisabled()
    expect(pushSwitch()).toHaveAccessibleDescription(/تنظیمات مرورگرتان مسدود است/)
  })

  it('turning it on asks the permission, shows the wait, then reads as on', async () => {
    let grant: () => void = () => {}
    browser.requestPermission.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          grant = () => resolve('granted')
        }),
    )
    const user = userEvent.setup()
    toggle()
    await user.click(pushSwitch())
    expect(browser.requestPermission).toHaveBeenCalledTimes(1)
    expect(pushSwitch()).toHaveAttribute('aria-disabled', 'true')
    expect(pushSwitch()).toHaveAccessibleDescription(/در حال روشن کردن/)
    // Pressed again meanwhile: ignored.
    await user.click(pushSwitch())
    expect(browser.requestPermission).toHaveBeenCalledTimes(1)
    grant()
    await waitFor(() => expect(pushSwitch()).toHaveAccessibleDescription(/روشن است/))
    expect(pushSwitch()).toBeChecked()
    expect(pushSwitch()).not.toHaveAttribute('aria-disabled')
  })

  it('a failure: off again, and the reason in an alert', async () => {
    browser.register.mockRejectedValueOnce(new Error('no worker'))
    const user = userEvent.setup()
    toggle()
    await user.click(pushSwitch())
    expect(await screen.findByRole('alert')).toHaveTextContent(ENABLE_FAILED)
    expect(pushSwitch()).not.toBeChecked()
  })
})
