import { describe, expect, it, vi } from 'vitest'
import { registrationTermsHtml } from '@/features/auth/terms'

vi.mock('server-only', () => ({}))
vi.mock('@/config/store-config', () => ({
  getStoreConfig: () => ({ apiUrl: 'https://api.shop.ir/', siteUrl: 'https://shop.ir' }),
}))

function dom(html: string | null): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = html ?? ''
  return container
}

describe('registrationTermsHtml', () => {
  it('is null when the operator wrote nothing visible', () => {
    expect(registrationTermsHtml(null)).toBeNull()
    expect(registrationTermsHtml('')).toBeNull()
    expect(registrationTermsHtml('<p>&nbsp;</p><script>alert(1)</script>')).toBeNull()
  })

  it('keeps the text, drops what could run, and opens every link in a new tab safely', () => {
    const html = registrationTermsHtml(
      '<p onclick="steal()">با ثبت‌نام <a href="/page/terms/">قوانین</a> و ' +
        '<a href="https://example.org/privacy">حریم خصوصی</a> را می‌پذیرید.' +
        '<a href="javascript:alert(1)">x</a><img src="data:image/png;base64,AAAA" onerror="alert(1)"><script>alert(1)</script></p>',
    )
    const container = dom(html)
    expect(container.textContent).toBe('با ثبت‌نام قوانین و حریم خصوصی را می‌پذیرید.x')
    expect(container.querySelector('script, img, [onclick], [onerror]')).toBeNull()
    const [terms, privacy, bad] = container.querySelectorAll('a')
    // The form would be lost if a link replaced the page: each opens a new tab.
    for (const link of [terms, privacy]) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(terms).toHaveAttribute('href', '/page/terms/')
    expect(bad).not.toHaveAttribute('href')
  })
})
