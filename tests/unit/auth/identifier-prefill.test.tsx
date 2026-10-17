import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { LoginScreen } from '@/features/auth/components/login-screen'
import { RegisterScreen } from '@/features/auth/components/register-screen'
import { handOffIdentifier, peekIdentifier } from '@/features/auth/identifier-handoff'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { handedByClick, resetHandoff } from '../support/handoff'

// What the visitor typed goes from one auth page to the next by the handoff, never in the URL
// (history, server logs, Referer, the operator's analytics): the pages ignore an `?identifier=`,
// prefill from the handoff, and take it once.

vi.mock('server-only', () => ({}))
vi.mock('@/features/auth/api', () => ({ authApi: {} }))
vi.mock('@/features/auth/profile-api', () => ({ fetchProfile: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('@/features/settings/api', () => ({ getSiteSettings: async () => null }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

const EMAIL = 'sara.ahmadi@example.com'
const field = (name = 'ایمیل یا شماره موبایل') => screen.getByRole('textbox', { name })

beforeEach(() => {
  stubBrowserApis()
  resetHandoff()
})

afterEach(() => resetHandoff())

describe('the auth pages', () => {
  it.each([
    ['login', () => import('@/app/(auth)/login/page')],
    ['register', () => import('@/app/(auth)/register/page')],
    ['forgot-password', () => import('@/app/(auth)/forgot-password/page')],
  ])('%s ignores an ?identifier= (only next is read from the URL)', async (_, load) => {
    const { default: Page } = await load()
    const searchParams = Promise.resolve({ identifier: EMAIL, next: '/cart/' })
    const element = await Page({ searchParams })
    expect(JSON.stringify(element.props)).not.toContain(EMAIL)
    expect(element.props).toMatchObject({ next: '/cart/' })
  })
})

describe('prefilled from the handoff', () => {
  it('login: prefilled once; the next visit starts empty', () => {
    handOffIdentifier('/login/', EMAIL)
    const { unmount } = render(<LoginScreen next="" />, { wrapper: authProviders().wrapper })
    expect(field()).toHaveValue(EMAIL)
    expect(peekIdentifier('/login/')).toBe('')
    unmount()
    render(<LoginScreen next="" />, { wrapper: authProviders().wrapper })
    expect(field()).toHaveValue('')
  })

  it('register: a mobile number picks its tab', () => {
    handOffIdentifier('/register/', '۰۹۱۲۱۲۳۴۵۰۱')
    render(<RegisterScreen next="" termsHtml={null} />, {
      wrapper: authProviders({ auth: everyMethodAuth() }).wrapper,
    })
    expect(screen.getByRole('tab', { name: 'شماره موبایل' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(field('شماره موبایل')).toHaveValue('09121234501')
  })

  it('a handoff to another page is not taken here', () => {
    handOffIdentifier('/register/', EMAIL)
    render(<ForgotPasswordScreen next="" />, { wrapper: authProviders().wrapper })
    expect(field()).toHaveValue('')
    expect(peekIdentifier('/register/')).toBe(EMAIL)
  })

  it('a page the server rendered: empty as its HTML, then prefilled once hydrated', async () => {
    const { wrapper: Providers } = authProviders()
    const page = <ForgotPasswordScreen next="" />
    const html = renderToString(<Providers>{page}</Providers>)
    handOffIdentifier('/forgot-password/', EMAIL)
    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = html
    const error = vi.spyOn(console, 'error')
    try {
      render(page, { container, hydrate: true, wrapper: Providers })
      const input = () => within(container).getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
      await waitFor(() => expect(input()).toHaveValue(EMAIL))
      expect(error).not.toHaveBeenCalled()
    } finally {
      error.mockRestore()
    }
  })
})

describe('the links that hand it over', () => {
  it('login’s «فراموشی رمز عبور»: recovery prefilled with what was typed', async () => {
    const user = userEvent.setup()
    render(<LoginFlow next="/cart/" initialIdentifier=" Sara.Ahmadi@Example.com " />, {
      wrapper: authProviders().wrapper,
    })
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    const forgot = await screen.findByRole('link', { name: 'فراموشی رمز عبور' })
    expect(forgot).toHaveAttribute('href', '/forgot-password/?next=%2Fcart%2F')
    expect(await handedByClick(forgot, '/forgot-password/')).toBe('Sara.Ahmadi@Example.com')
  })

  it('a link opened in a new tab takes nothing with it', async () => {
    render(<ForgotPasswordScreen next="" />, { wrapper: authProviders().wrapper })
    await userEvent.setup().type(field(), EMAIL)
    const back = screen.getByRole('link', { name: 'بازگشت به صفحهٔ ورود' })
    back.addEventListener('click', (event) => event.preventDefault())
    fireEvent.click(back, { ctrlKey: true })
    fireEvent.click(back, { button: 1 })
    expect(peekIdentifier('/login/')).toBe('')
    fireEvent.click(back)
    expect(peekIdentifier('/login/')).toBe(EMAIL)
  })
})
