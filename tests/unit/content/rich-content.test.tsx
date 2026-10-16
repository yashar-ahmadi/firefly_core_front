import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PublicStoreConfig } from '@/config/resolve-store-config'
import { RichContent } from '@/features/content/rich-content'
import { RichContentBody } from '@/features/content/rich-content-body'
import { StoreConfigProvider } from '@/lib/config-context'

const mocks = vi.hoisted(() => ({ push: vi.fn() }))

vi.mock('server-only', () => ({}))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})

const CONFIG = {
  siteUrl: 'https://shop.ir/',
  mediaOrigin: 'https://api.shop.ir',
} as PublicStoreConfig

/** Whether the last click's default action was cancelled before it reached the document. */
let prevented: boolean | null = null
const record = (event: MouseEvent) => {
  prevented = event.defaultPrevented
  // jsdom cannot navigate; stop it from trying (and logging) after the check.
  event.preventDefault()
}

function renderHtml(html: string, className?: string) {
  const content: ReactNode = <RichContent html={html} className={className} />
  return render(<StoreConfigProvider value={CONFIG}>{content}</StoreConfigProvider>)
}

/** The client part alone, with markup the sanitiser would have changed (e.g. `download`). */
function renderBody(html: string) {
  return render(
    <StoreConfigProvider value={CONFIG}>
      <RichContentBody html={html} className="rich-content" />
    </StoreConfigProvider>,
  )
}

beforeEach(() => {
  mocks.push.mockReset()
  prevented = null
  document.addEventListener('click', record)
})

afterEach(() => {
  document.removeEventListener('click', record)
})

describe('RichContent', () => {
  it('renders the sanitised HTML inside .rich-content', () => {
    const { container } = renderHtml(
      '<h1>عنوان</h1><p style="color:red" onclick="x()">متن <img src="/media/a.png"></p><script>x()</script>',
      'mt-4',
    )
    const body = container.firstElementChild
    expect(body).toHaveClass('rich-content', 'mt-4')
    expect(body?.innerHTML).toBe(
      '<h2>عنوان</h2><p>متن <img src="https://api.shop.ir/media/a.png" alt="" loading="lazy" decoding="async"></p>',
    )
  })

  it('renders nothing for empty or script-only HTML', () => {
    expect(renderHtml('  ').container).toBeEmptyDOMElement()
    expect(renderHtml('<script>alert(1)</script>').container).toBeEmptyDOMElement()
  })

  it('routes a click on a storefront link on the client', () => {
    renderHtml('<p><a href="/product/list/?has_discount=true"><b>تخفیف\u{200C}ها</b></a></p>')
    fireEvent.click(screen.getByText('تخفیف\u{200C}ها'))
    expect(mocks.push).toHaveBeenCalledWith('/product/list/?has_discount=true')
    expect(prevented).toBe(true)
  })

  it("routes a link to the shop's own origin as a path", () => {
    renderHtml('<a href="https://shop.ir/brand/apple/">اپل</a>')
    fireEvent.click(screen.getByRole('link', { name: 'اپل' }))
    expect(mocks.push).toHaveBeenCalledWith('/brand/apple/')
  })

  it.each([
    ['a short link', '<a href="/s/phone-fest/">لینک</a>', {}],
    ['a short link with a query', '<a href="/s/phone-fest?utm_source=x">لینک</a>', {}],
    ['a ctrl-click', '<a href="/product/x/">لینک</a>', { ctrlKey: true }],
    ['a cmd-click', '<a href="/product/x/">لینک</a>', { metaKey: true }],
    ['a shift-click', '<a href="/product/x/">لینک</a>', { shiftKey: true }],
    ['an alt-click', '<a href="/product/x/">لینک</a>', { altKey: true }],
    ['a middle click', '<a href="/product/x/">لینک</a>', { button: 1 }],
    ['a new-tab link', '<a href="/product/x/" target="_blank">لینک</a>', {}],
    ['a download', '<a href="/product/x/" download>لینک</a>', {}],
    ['a hash-only link', '<a href="#faq">لینک</a>', {}],
    ['a link to another site', '<a href="https://example.com/x">لینک</a>', {}],
    ['a protocol-relative link', '<a href="//example.com/x">لینک</a>', {}],
    ['an email link', '<a href="mailto:a@shop.ir">لینک</a>', {}],
  ])('leaves %s to the browser', (_label, html, init) => {
    renderBody(html)
    fireEvent.click(screen.getByRole('link', { name: 'لینک' }), init)
    expect(mocks.push).not.toHaveBeenCalled()
    expect(prevented).toBe(false)
  })

  it('ignores clicks outside links', () => {
    renderHtml('<p>فقط متن</p>')
    fireEvent.click(screen.getByText('فقط متن'))
    expect(mocks.push).not.toHaveBeenCalled()
  })
})
