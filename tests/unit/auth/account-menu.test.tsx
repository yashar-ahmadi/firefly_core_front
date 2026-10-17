import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderActions } from '@/components/layout/header-actions'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'
import { cart, result } from '../cart/support'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { SARA } from './fixtures'

// The header's account entry (ruling P3-R2): the login link for a guest; for a signed-in visitor
// a menu button with her initials, whose menu (loaded on first use) names her, links the account
// pages and logs out.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    pathname: '/product/x/',
    profile: vi.fn(),
    logout: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  }
})
// The BFF, by path: the profile, a guest's empty cart, and logout.
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string, init?: unknown) => {
    if (path === 'account/profile/me/') return result(await mocks.profile())
    if (path === 'account/auth/logout/') return result(await mocks.logout(init))
    return result(cart())
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.pathname = '/product/x/'
  mocks.profile.mockResolvedValue(SARA)
  mocks.logout.mockResolvedValue({})
})

function renderActions(hasSession: boolean) {
  const providers = authProviders({ hasSession })
  render(<HeaderActions />, { wrapper: providers.wrapper })
  return { user: userEvent.setup(), client: providers.client }
}

const accountButton = (name = 'حساب کاربری: سارا احمدی') => screen.findByRole('button', { name })

async function openMenu(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await accountButton())
  return screen.findByRole('menu')
}

describe('the header account entry', () => {
  it('guest: «ورود | ثبت‌نام», returning to the page, and no account menu', () => {
    renderActions(false)
    expect(screen.getByRole('link', { name: 'ورود | ثبت‌نام' })).toHaveAttribute(
      'href',
      '/login/?next=/product/x/',
    )
    expect(screen.queryByRole('button', { name: /حساب/ })).toBeNull()
  })

  it('signed in: a menu button with her initials, named after her once the profile is in', async () => {
    let answer: (profile: UserProfile) => void = () => {}
    mocks.profile.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderActions(true)
    // While the profile loads: a skeleton in the avatar's place, the generic name.
    const loading = await screen.findByRole('button', { name: 'حساب من' })
    expect(loading).toHaveAttribute('aria-haspopup', 'menu')
    expect(loading.querySelector('[class*="animate-shimmer"]')).not.toBeNull()
    answer(SARA)
    const button = await accountButton()
    expect(button).toBe(loading)
    expect(button).toHaveTextContent('س\u{200C}ا')
    expect(button.querySelector('[class*="animate-shimmer"]')).toBeNull()
  })

  it('names her in the menu, and links the account pages before a separated «خروج»', async () => {
    const { user } = renderActions(true)
    const menu = await openMenu(user)
    expect(within(menu).getByText('سارا احمدی')).toBeVisible()
    expect(within(menu).getByText('sara.ahmadi@example.com')).toBeVisible()
    const items = within(menu).getAllByRole('menuitem')
    expect(items.map((item) => [item.textContent, item.getAttribute('href')])).toEqual([
      ['پیشخوان', '/account/'],
      ['سفارش\u{200C}ها', '/account/orders/'],
      ['علاقه\u{200C}مندی\u{200C}ها', '/account/wishlist/'],
      ['نشانی\u{200C}ها', '/account/addresses/'],
      ['اعلان\u{200C}ها', '/account/notifications/'],
      ['خروج', null],
    ])
    // «خروج» stands apart: a separator before it, and it is the last item.
    const logout = within(menu).getByRole('menuitem', { name: 'خروج' })
    expect(logout.previousElementSibling).toHaveAttribute('role', 'separator')
  })

  it('«خروج» logs out through the API, goes home and gives the header back to the guest', async () => {
    const { user, client } = renderActions(true)
    await openMenu(user)
    await user.click(screen.getByRole('menuitem', { name: 'خروج' }))
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.notify.success).toHaveBeenCalledWith('از حساب خارج شدید')
    expect(client.getQueryData(['me'])).toBeUndefined()
    // The login link takes the account button's place, and the focus with it.
    const login = await screen.findByRole('link', { name: 'ورود | ثبت‌نام' })
    expect(screen.queryByRole('menu')).toBeNull()
    await waitFor(() => expect(login).toHaveFocus())
  })

  it('a session the API no longer accepts turns the header into the guest one, in place', async () => {
    mocks.profile.mockRejectedValue(new ApiError({ status: 401, code: 'not_authenticated' }))
    renderActions(true)
    expect(await screen.findByRole('link', { name: 'ورود | ثبت‌نام' })).toBeVisible()
    expect(mocks.replace).not.toHaveBeenCalled()
    expect(mocks.router.push).not.toHaveBeenCalled()
  })

  it('names a visitor known only by her mobile number by that number, in Persian', async () => {
    mocks.profile.mockResolvedValue({
      ...SARA,
      first_name: '',
      last_name: '',
      full_name: '',
      email: null,
    })
    renderActions(true)
    expect(await accountButton('حساب کاربری: ۰۹۱۲ ۱۲۳ ۴۵۰۱')).toBeVisible()
  })

  it('marks «اعلان‌ها» while the inbox knows of unread notifications', async () => {
    const { user, client } = renderActions(true)
    client.setQueryData(UNREAD_NOTIFICATIONS_KEY, 2)
    const menu = await openMenu(user)
    const item = within(menu).getByRole('menuitem', { name: /^اعلان/ })
    expect(item).toHaveAccessibleName('اعلان\u{200C}ها، اعلان خوانده\u{200C}نشده دارید')
  })
})
