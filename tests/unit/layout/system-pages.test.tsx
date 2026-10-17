import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { Children, isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import ShopLayout from '@/app/(shop)/layout'
import ShopNotFound, { generateMetadata as shopNotFoundMetadata } from '@/app/(shop)/not-found'
import ErrorPage from '@/app/error'
import GlobalError from '@/app/global-error'
import NotFound, { generateMetadata as notFoundMetadata } from '@/app/not-found'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { NotFoundView } from '@/components/layout/not-found-view'
import { ShopShell } from '@/components/layout/shop-shell'
import { SiteFooter } from '@/components/layout/site-footer'
import { SiteHeader } from '@/components/layout/site-header'
import { LiveAnnouncer } from '@/components/ui/live-announcer'
import { I18nProvider } from '@/lib/i18n/i18n-context'
import { sampleTree } from './support'

vi.mock('server-only', () => ({}))
vi.mock('@/features/settings/api', () => ({
  getTranslations: async () => ({}),
  getCategoryTree: async () => sampleTree(),
  getSiteSettings: async () => ({ name: 'فایرفلای' }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})

async function renderNotFound() {
  const view: ReactNode = await NotFoundView()
  return render(<I18nProvider overrides={{}}>{view}</I18nProvider>)
}

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
})

describe('NotFoundView', () => {
  it('says the page was not found, with a decorative illustration', async () => {
    const { container } = await renderNotFound()
    expect(
      screen.getByRole('heading', { level: 1, name: 'صفحه‌ای که دنبالش بودید پیدا نشد' }),
    ).toBeInTheDocument()
    const illustration = container.querySelector('[data-illustration="not-found"]')
    expect(illustration).toHaveAttribute('aria-hidden', 'true')
  })

  it('offers a search form that GETs /search/?q=, its landmark named apart from the header', async () => {
    await renderNotFound()
    const search = screen.getByRole('search', { name: 'جستجو در فروشگاه' })
    expect(search).toHaveAttribute('action', '/search/')
    expect(within(search).getByRole('searchbox')).toHaveAttribute('name', 'q')
  })

  it('links home, to the categories and to the top-level categories', async () => {
    await renderNotFound()
    expect(screen.getByRole('link', { name: 'صفحه\u{0654} اصلی' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'دسته‌بندی‌ها' })).toHaveAttribute(
      'href',
      '/categories/',
    )
    const popular = screen.getByRole('list', { name: 'دسته‌بندی‌های اصلی' })
    expect(
      within(popular)
        .getAllByRole('link')
        .map((link) => link.getAttribute('href')),
    ).toEqual(['/product-category/digital/', '/product-category/home-appliance/'])
  })
})

describe('not-found.tsx and the shop shell', () => {
  it('wraps unknown URLs in the shop shell, titled with the shop name', async () => {
    const page = NotFound()
    expect(page.type).toBe(ShopShell)
    expect((page.props as { children: ReactElement }).children.type).toBe(NotFoundView)
    expect((await notFoundMetadata()).title).toEqual({ absolute: 'صفحه پیدا نشد | فایرفلای' })
  })

  it('shows only the 404 body for notFound() inside the shop layout', () => {
    expect(ShopNotFound().type).toBe(NotFoundView)
    expect(ShopLayout({ children: null }).type).toBe(ShopShell)
  })

  it("titles a shop page's notFound() like an unknown URL (a page's own metadata is dropped)", async () => {
    expect((await shopNotFoundMetadata()).title).toEqual({
      absolute: 'صفحه پیدا نشد | فایرفلای',
    })
  })

  it('puts the footer between the page and the bottom navigation', () => {
    const shell = ShopShell({ children: <p>صفحه</p> }) as ReactElement<{ children: ReactNode }>
    const parts = Children.toArray(shell.props.children).filter(isValidElement)
    // Then the shop's polite live region, which takes no space (LiveAnnouncer).
    expect(parts.map((part) => part.type).slice(-5)).toEqual([
      SiteHeader,
      'main',
      SiteFooter,
      MobileBottomNav,
      LiveAnnouncer,
    ])
    // The skip link lives in the root layout (first in <body>); its target is this <main>.
    expect(parts.some((part) => part.type === 'a')).toBe(false)
    const main = parts.find((part) => part.type === 'main') as ReactElement<{ id?: string }>
    expect(main.props.id).toBe('main')
  })
})

// The root boundary loads its view on demand (error-boundary-chunk.test.tsx): awaited here.
describe('error.tsx', () => {
  it('is the skip link target when it replaces the shop layout', async () => {
    const { container } = render(
      <ErrorPage error={new Error('x')} reset={vi.fn()} retry={vi.fn()} />,
    )
    expect(container.querySelector('main#main')).toContainElement(
      await screen.findByRole('heading', { level: 1 }),
    )
  })

  it('shows a friendly message, retries and links home', async () => {
    const user = userEvent.setup()
    const retry = vi.fn()
    const error = Object.assign(new Error('boom'), { digest: '4096538751' })
    render(
      <I18nProvider overrides={{}}>
        <ErrorPage error={error} reset={vi.fn()} retry={retry} />
      </I18nProvider>,
    )
    expect(
      await screen.findByRole('heading', { level: 1, name: 'مشکلی پیش آمد' }),
    ).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(retry).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'صفحه\u{0654} اصلی' })).toHaveAttribute('href', '/')
    // The digest helps support match the server log; it is shown left to right.
    expect(screen.getByText('4096538751')).toHaveAttribute('dir', 'ltr')
    // A streamed error page answers 200: it must not be indexed.
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
  })

  it('logs the error with its digest', async () => {
    const error = Object.assign(new Error('boom'), { digest: 'abc123' })
    render(<ErrorPage error={error} reset={vi.fn()} retry={vi.fn()} />)
    await screen.findByRole('heading', { level: 1 })
    expect(consoleError).toHaveBeenCalledWith('[error-boundary]', 'abc123', error)
  })

  it('shows no reference without a digest', async () => {
    render(<ErrorPage error={new Error('client')} reset={vi.fn()} retry={vi.fn()} />)
    await screen.findByRole('heading', { level: 1 })
    expect(screen.queryByText(/کد پیگیری/)).toBeNull()
  })
})

describe('global-error.tsx', () => {
  it('is a complete RTL Persian document with inline styles and no external assets', () => {
    const html = renderToStaticMarkup(
      <GlobalError error={new Error('root')} reset={vi.fn()} retry={vi.fn()} />,
    )
    expect(html).toMatch(/^<html lang="fa" dir="rtl"/)
    expect(html).toContain('<title>')
    expect(html).toContain('مشکلی پیش آمد')
    expect(html).toContain('تلاش دوباره')
    expect(html).toContain('href="/"')
    expect(html).not.toMatch(/<link|<script|src=/)
  })
})
