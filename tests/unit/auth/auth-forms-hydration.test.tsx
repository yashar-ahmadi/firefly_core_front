import { render, waitFor, within } from '@testing-library/react'
import type { ReactElement } from 'react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NO_SCRIPT } from '@/features/auth/components/auth-card'
import { ForgotPasswordScreen } from '@/features/auth/components/forgot-password-screen'
import { LoginScreen } from '@/features/auth/components/login-screen'
import { RegisterScreen } from '@/features/auth/components/register-screen'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// The auth forms never submit natively (a GET would put names, an email or a mobile number in
// the URL, the history and the server logs): the server HTML has the submit button disabled
// and a POST form, the page says JavaScript is needed, and hydration enables the button.

vi.mock('@/features/auth/api', () => ({ authApi: {} }))
vi.mock('@/features/auth/profile-api', () => ({ fetchProfile: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))

beforeEach(() => {
  stubBrowserApis()
})

const PAGES: [string, ReactElement, string][] = [
  ['/login/', <LoginScreen key="login" next="" />, 'ادامه'],
  ['/register/', <RegisterScreen key="register" next="" termsHtml={null} />, 'دریافت کد تأیید'],
  ['/forgot-password/', <ForgotPasswordScreen key="forgot" next="" />, 'ارسال کد بازیابی'],
]

describe.each(PAGES)('%s', (_path, page, submit) => {
  it('serves a disabled submit button in a POST form, which hydration enables', async () => {
    const { wrapper: Providers } = authProviders()
    const html = renderToString(<Providers>{page}</Providers>)
    expect(html).toContain(`<noscript>`)
    expect(html).toContain(NO_SCRIPT)

    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = html
    const button = within(container).getByRole('button', { name: submit })
    expect(button).toBeDisabled()
    expect(button).toHaveAttribute('type', 'submit')
    expect(button.closest('form')).toHaveAttribute('method', 'post')

    render(page, { container, hydrate: true, wrapper: Providers })
    await waitFor(() => expect(button).toBeEnabled())
    // Hydrated in place, not drawn again.
    expect(within(container).getByRole('button', { name: submit })).toBe(button)
    expect(button.closest('form')).toHaveAttribute('method', 'post')
  })
})
