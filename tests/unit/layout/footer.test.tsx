import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { Providers } from '@/app/providers'
import { SiteFooter } from '@/components/layout/site-footer'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'
import type { FeatureMap } from '@/features/settings/feature-context'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import type { MenuNode, SiteSettings, Snippet, Social } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { stubBrowserApis } from '../support/dom-stubs'
import { menuNode } from './support'

const mocks = vi.hoisted(() => ({
  settings: null as SiteSettings | null,
  footer: [] as MenuNode[],
  socials: [] as Social[],
  snippets: [] as Snippet[],
}))

vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({
  // An ordinary page, as the proxy marks it (operator code renders only there).
  headers: async () => new Headers({ 'x-ff-route-kind': 'page' }),
}))
// The root providers' session sweep uses the App Router (mounted around them in the app).
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/config/store-config', async () => {
  const pure = await import('@/config/resolve-store-config')
  const { parseServerEnv: parse } = await import('@/config/env-schema')
  const config = pure.resolveStoreConfig(
    parse({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  )
  return { ...pure, getStoreConfig: () => config }
})
vi.mock('@/features/settings/api', () => ({
  getSiteSettings: async () => mocks.settings,
  getMenu: async (key: string) => (key === 'footer' ? mocks.footer : []),
  getSocials: async () => mocks.socials,
  getSnippets: async () => mocks.snippets,
  getTranslations: async () => ({}),
}))

const config = toPublicConfig(
  resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'k',
    }),
  ),
)
const features = Object.fromEntries(
  FEATURE_KEYS.map((key) => [key, { key, name: '', enabled: true, reason: null }]),
) as FeatureMap

async function renderFooter() {
  const footer: ReactNode = await SiteFooter()
  return render(
    <Providers
      config={config}
      auth={emailOnlyAuth()}
      features={features}
      translations={{}}
      hasSession={false}
    >
      {footer}
    </Providers>,
  )
}

const SETTINGS = {
  name: 'فایرفلای',
  slogan: 'خرید مطمئن، ارسال سریع',
  copyright: 'کلیه حقوق این وب سایت متعلق به فروشگاه فایرفلای است.',
  footer:
    '<p>فروشگاه <strong>فایرفلای</strong><script>alert(1)</script><img src="/media/footer/badge.png" alt="نشان کیفیت" onerror="x()"></p>',
  logo: 'https://api.shop.ir/media/site-logo.png',
  logo2: 'https://api.shop.ir/media/site-logo-alt.png',
  phone: '+982191000000',
  phone2: '+982188776655',
  response_time: 'شنبه تا چهارشنبه ۹ تا ۱۸',
  email: 'support@shop.ir',
  address: 'تهران، خیابان ولیعصر\nپلاک ۲۴۰',
  postal_code: '1969734512',
  map: 'https://maps.google.com/?q=35.7564,51.4100',
  app_store_download_link: null,
  ios_application_download_link: null,
  google_play_download_link: 'https://play.google.com/store/apps/details?id=ir.shop',
  android_application_download_link: 'https://cafebazaar.ir/app/ir.shop',
  web_application_link: null,
  support_link: null,
} as unknown as SiteSettings

const SOCIALS: Social[] = [
  {
    id: 1,
    name: 'اینستاگرام',
    username_or_id: 'fireflyshop',
    logo: 'https://api.shop.ir/media/social-1.png',
    link: 'https://instagram.com/fireflyshop',
  },
  {
    id: 2,
    name: 'تلگرام',
    username_or_id: '@fireflyshop',
    logo: null,
    link: 'https://t.me/fireflyshop',
  },
]

const SEAL =
  '<a href="https://trustseal.enamad.ir/?id=1" target="_blank"><img src="https://trustseal.enamad.ir/logo.aspx?id=1" alt="نماد اعتماد الکترونیکی"></a>'

beforeEach(() => {
  stubBrowserApis()
  mocks.settings = { ...SETTINGS }
  mocks.footer = [
    menuNode({
      id: 1,
      title: 'خدمات مشتریان',
      url: null,
      children: [
        menuNode({ id: 2, title: 'پرسش‌های متداول', url: '/faq/' }),
        menuNode({ id: 3, title: 'پیگیری سفارش', url: '/account/orders/' }),
      ],
    }),
    menuNode({ id: 4, title: 'قوانین و مقررات', url: '/page/terms/', link_type: 'page' }),
    menuNode({ id: 5, title: 'حریم خصوصی', url: '/page/privacy/', link_type: 'page' }),
  ]
  mocks.socials = SOCIALS
  mocks.snippets = []
})

describe('SiteFooter: menu columns', () => {
  it('turns a `none` node with children into a column with a heading', async () => {
    await renderFooter()
    const column = screen.getByRole('region', { name: 'خدمات مشتریان' })
    const heading = within(column).getByRole('heading', { level: 2, name: 'خدمات مشتریان' })
    expect(heading.querySelector('a')).toBeNull()
    expect(within(column).getByRole('link', { name: 'پرسش‌های متداول' })).toHaveAttribute(
      'href',
      '/faq/',
    )
    expect(within(column).getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })

  it('collects top-level links without children under «لینک‌های مفید»', async () => {
    await renderFooter()
    const column = screen.getByRole('region', { name: 'لینک‌های مفید' })
    expect(
      within(column)
        .getAllByRole('link')
        .map((link) => [link.textContent, link.getAttribute('href')]),
    ).toEqual([
      ['قوانین و مقررات', '/page/terms/'],
      ['حریم خصوصی', '/page/privacy/'],
    ])
  })

  it('also offers the columns as native disclosures (shown on phones), links in the HTML', async () => {
    const user = userEvent.setup()
    await renderFooter()
    const nav = screen.getByRole('navigation', { name: 'پیوندهای پایین صفحه' })
    const summary = within(nav)
      .getAllByRole('heading', { level: 2, name: 'لینک‌های مفید' })
      .map((heading) => heading.closest('summary'))
      .find((element) => element !== null)!
    const details = summary.parentElement!
    expect(details.tagName).toBe('DETAILS')
    expect(details).not.toHaveAttribute('open')
    // Closed, its links are still in the page (no script needed to show them).
    expect(screen.getAllByRole('link', { name: 'قوانین و مقررات', hidden: true })).toHaveLength(2)
    await user.click(summary)
    expect(details).toHaveAttribute('open')
  })

  it('renders no menu without footer items', async () => {
    mocks.footer = []
    await renderFooter()
    expect(screen.queryByRole('navigation', { name: 'پیوندهای پایین صفحه' })).toBeNull()
  })
})

describe('SiteFooter: identity and contact', () => {
  it('shows the primary logo linking home, the slogan and the sanitised footer text', async () => {
    await renderFooter()
    const footer = screen.getByRole('contentinfo')
    const logo = within(footer).getByRole('img', { name: 'فایرفلای' })
    // `logo`, like the header: `logo2` may be a light variant meant for dark surfaces (R10).
    expect(logo).toHaveAttribute('src', expect.stringContaining('site-logo.png'))
    expect(within(footer).getByRole('link', { name: 'فایرفلای' })).toHaveAttribute('href', '/')
    expect(within(footer).getByText('خرید مطمئن، ارسال سریع')).toBeInTheDocument()

    expect(footer.querySelector('script')).toBeNull()
    const badge = within(footer).getByRole('img', { name: 'نشان کیفیت' })
    expect(badge).toHaveAttribute('src', 'https://api.shop.ir/media/footer/badge.png')
    expect(badge).not.toHaveAttribute('onerror')
  })

  it('never uses logo2, and falls back to the wordmark when the logo fails', async () => {
    await renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(footer.querySelector('img[src*="site-logo-alt"]')).toBeNull()
    fireEvent.error(within(footer).getByRole('img', { name: 'فایرفلای' }))
    expect(within(footer).getByRole('img', { name: 'فایرفلای' }).tagName).toBe('SPAN')
    expect(footer.querySelector('img[src*="site-logo-alt"]')).toBeNull()
  })

  it('links phone and phone2 with tel:, shown left to right in Persian digits', async () => {
    await renderFooter()
    const footer = screen.getByRole('contentinfo')
    const first = within(footer).getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })
    const second = within(footer).getByRole('link', { name: '۰۲۱ ۸۸۷۷ ۶۶۵۵' })
    expect(first).toHaveAttribute('href', 'tel:+982191000000')
    expect(second).toHaveAttribute('href', 'tel:+982188776655')
    expect(first).toHaveAttribute('dir', 'ltr')
  })

  it('shows email, address with postal code, the map link and the response time', async () => {
    await renderFooter()
    const contact = screen.getByRole('region', { name: 'ارتباط با ما' })
    expect(within(contact).getByRole('link', { name: 'support@shop.ir' })).toHaveAttribute(
      'href',
      'mailto:support@shop.ir',
    )
    expect(within(contact).getByText(/پلاک ۲۴۰/)).toHaveClass('whitespace-pre-line')
    expect(within(contact).getByText('کد پستی: ۱۹۶۹۷۳۴۵۱۲')).toBeInTheDocument()
    const map = within(contact).getByRole('link', { name: 'مشاهده روی نقشه' })
    expect(map).toHaveAttribute('href', 'https://maps.google.com/?q=35.7564,51.4100')
    expect(map).toHaveAttribute('target', '_blank')
    expect(within(contact).getByText('شنبه تا چهارشنبه ۹ تا ۱۸')).toBeInTheDocument()
  })

  it('shows the copyright as plain text', async () => {
    mocks.settings = { ...SETTINGS, copyright: '<b>© ۱۴۰۵</b> فایرفلای' }
    await renderFooter()
    const copyright = screen.getByText('© ۱۴۰۵ فایرفلای')
    expect(copyright.querySelector('b')).toBeNull()
  })

  it('renders a minimal footer without settings', async () => {
    mocks.settings = null
    await renderFooter()
    const footer = screen.getByRole('contentinfo')
    expect(within(footer).getByRole('img', { name: 'فروشگاه' }).tagName).toBe('SPAN')
    expect(screen.queryByRole('region', { name: 'ارتباط با ما' })).toBeNull()
    expect(within(footer).queryByRole('link', { name: /دریافت از/ })).toBeNull()
  })
})

describe('SiteFooter: socials, apps and trust badges', () => {
  it('links each social account in a new tab, named after it, with its logo', async () => {
    await renderFooter()
    const socials = screen.getByRole('region', { name: 'ما را دنبال کنید' })
    const instagram = within(socials).getByRole('link', { name: 'اینستاگرام' })
    expect(instagram).toHaveAttribute('href', 'https://instagram.com/fireflyshop')
    expect(instagram).toHaveAttribute('target', '_blank')
    expect(instagram.getAttribute('rel')).toContain('noopener')
    const logo = instagram.querySelector('img')
    expect(logo).toHaveAttribute('alt', '')
    expect(logo).toHaveAttribute('src', expect.stringContaining('social-1.png'))
  })

  it('shows the first letter of the name when a social logo is missing or fails', async () => {
    await renderFooter()
    const socials = screen.getByRole('region', { name: 'ما را دنبال کنید' })
    expect(within(socials).getByRole('link', { name: 'تلگرام' })).toHaveTextContent('ت')
    const instagram = within(socials).getByRole('link', { name: 'اینستاگرام' })
    fireEvent.error(instagram.querySelector('img') as HTMLImageElement)
    expect(instagram.querySelector('img')).toBeNull()
    expect(instagram).toHaveTextContent('ا')
  })

  it('shows only the app badges whose links are set, named by their store', async () => {
    await renderFooter()
    const apps = screen.getByRole('region', { name: 'دریافت اپلیکیشن' })
    const links = within(apps).getAllByRole('link')
    expect(links.map((link) => [link.textContent, link.getAttribute('href')])).toEqual([
      ['دریافت از گوگل‌پلی', 'https://play.google.com/store/apps/details?id=ir.shop'],
      ['دریافت از بازار', 'https://cafebazaar.ir/app/ir.shop'],
    ])
    for (const link of links) expect(link).toHaveAttribute('target', '_blank')
  })

  it('names direct downloads and the web app when no store is recognised', async () => {
    mocks.settings = {
      ...SETTINGS,
      google_play_download_link: null,
      android_application_download_link: 'https://dl.shop.ir/app.apk',
      ios_application_download_link: 'https://sibapp.com/applications/shop',
      app_store_download_link: 'https://apps.apple.com/app/id1',
      web_application_link: 'https://app.shop.ir/',
    }
    await renderFooter()
    const apps = screen.getByRole('region', { name: 'دریافت اپلیکیشن' })
    expect(
      within(apps)
        .getAllByRole('link')
        .map((link) => link.textContent),
    ).toEqual([
      'دانلود مستقیم اندروید',
      'دریافت از اپ‌استور',
      'دریافت از سیب‌اپ',
      'استفاده از نسخه\u{0654} وب',
    ])
  })

  it('hides the app section when every link is null', async () => {
    mocks.settings = {
      ...SETTINGS,
      google_play_download_link: null,
      android_application_download_link: null,
    }
    await renderFooter()
    expect(screen.queryByRole('region', { name: 'دریافت اپلیکیشن' })).toBeNull()
  })

  it('shows the trust badges (bottom snippet HTML) under a heading only when there are some', async () => {
    const first = await renderFooter()
    expect(screen.queryByRole('region', { name: 'نمادهای اعتماد' })).toBeNull()
    first.unmount()

    mocks.snippets = [
      { id: 7, description: '', position: 'bottom_of_body', type: 'script', snippet: SEAL },
      {
        id: 8,
        description: '',
        position: 'bottom_of_body',
        type: 'script',
        snippet: '<script>x()</script>',
      },
    ]
    await renderFooter()
    const trust = screen.getByRole('region', { name: 'نمادهای اعتماد' })
    expect(within(trust).getByRole('img', { name: 'نماد اعتماد الکترونیکی' })).toBeInTheDocument()
    expect(trust.querySelector('[data-snippet-zone="bottom"]')).not.toBeNull()
    expect(trust.querySelector('script')).toBeNull()
  })
})

describe('SiteFooter: back to top', () => {
  it('scrolls to the top smoothly and moves focus to the main content', async () => {
    const user = userEvent.setup()
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    const main = document.createElement('main')
    main.id = 'main'
    main.tabIndex = -1
    document.body.append(main)

    await renderFooter()
    await user.click(screen.getByRole('button', { name: 'بازگشت به بالا' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'smooth' })
    expect(document.activeElement).toBe(main)
    main.remove()
  })

  it('jumps without animation when reduced motion is preferred', async () => {
    const user = userEvent.setup()
    stubBrowserApis((query) => query === '(prefers-reduced-motion: reduce)')
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)
    await renderFooter()
    await user.click(screen.getByRole('button', { name: 'بازگشت به بالا' }))
    expect(scrollTo).toHaveBeenCalledWith({ top: 0, behavior: 'auto' })
  })
})
