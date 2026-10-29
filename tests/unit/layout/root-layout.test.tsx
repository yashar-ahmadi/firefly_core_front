import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ThemeHead } from '@/app/_shell/theme-head'
import RootLayout, { generateMetadata, generateViewport } from '@/app/layout'
import { Providers } from '@/app/providers'
import { SkipLink } from '@/components/layout/skip-link'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'
import { parseServerEnv } from '@/config/env-schema'
import { resolveStoreConfig, type StoreConfig } from '@/config/resolve-store-config'
import { SnippetHtmlZone, Snippets } from '@/features/settings/snippets'
import { FEATURE_KEYS } from '@/lib/api/types/common'
import type { AuthSettings, FeatureState, SiteSettings } from '@/lib/api/types/settings'

const mocks = vi.hoisted(() => ({
  config: undefined as unknown as StoreConfig,
  settings: null as SiteSettings | null,
  cookies: new Set<string>(),
  getSnippets: vi.fn(async () => []),
}))

vi.mock('server-only', () => ({}))
vi.mock('@/lib/fonts', () => ({ vazirmatn: { variable: 'vazirmatn-variable' } }))
vi.mock('next/headers', () => ({
  cookies: async () => ({ has: (name: string) => mocks.cookies.has(name) }),
}))
vi.mock('@/config/store-config', async () => ({
  ...(await import('@/config/resolve-store-config')),
  getStoreConfig: () => mocks.config,
}))

const features = Object.fromEntries(
  FEATURE_KEYS.map((key): [string, FeatureState] => [
    key,
    { key, name: '', enabled: key !== 'wallet', reason: key === 'wallet' ? 'به‌زودی' : null },
  ]),
)
vi.mock('@/features/settings/api', async (importOriginal) => ({
  disabledAuth: (await importOriginal<typeof import('@/features/settings/api')>()).disabledAuth,
  getSiteSettings: async () => mocks.settings,
  getFeatureStatus: async () => features,
  getTranslations: async () => ({ cart: 'سبد من' }),
  getSnippets: mocks.getSnippets,
}))

function configWith(env: Record<string, string> = {}): StoreConfig {
  return resolveStoreConfig(
    parseServerEnv({
      FIREFLY_API_URL: 'https://api.shop.ir/',
      SITE_URL: 'https://shop.ir/',
      FIREFLY_API_KEY: 'secret-key',
      ...env,
    }),
  )
}

const SETTINGS = {
  name: 'فایرفلای',
  slogan: 'خرید مطمئن، ارسال سریع',
  favicon: 'https://api.shop.ir/media/site-favicon.png',
} as SiteSettings

type Element = ReactElement<{ children?: ReactNode } & Record<string, unknown>>

/** Every element in the (unrendered) tree, depth first. Function components are not called. */
function elements(node: ReactNode): Element[] {
  if (Array.isArray(node)) return node.flatMap(elements)
  if (!isValidElement(node)) return []
  const element = node as Element
  return [element, ...elements(element.props.children)]
}

beforeEach(() => {
  mocks.config = configWith()
  mocks.settings = null
  mocks.cookies.clear()
})

describe('root layout metadata', () => {
  it('falls back to the preset label when the settings are unavailable', async () => {
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ default: 'فروشگاه', template: '%s | فروشگاه' })
    expect(String(metadata.metadataBase)).toBe('https://shop.ir/')
    expect(metadata.formatDetection).toEqual({ telephone: false })
    // Unknown values are left out, not set to undefined.
    expect(Object.keys(metadata).sort()).toEqual(['formatDetection', 'metadataBase', 'title'])
  })

  it('uses the shop name, slogan and favicon from the settings', async () => {
    mocks.settings = SETTINGS
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({
      default: 'فایرفلای | خرید مطمئن، ارسال سریع',
      template: '%s | فایرفلای',
    })
    expect(metadata.description).toBe('خرید مطمئن، ارسال سریع')
    expect(metadata.icons).toEqual({ icon: 'https://api.shop.ir/media/site-favicon.png' })
  })

  it('treats a blank name or slogan as missing', async () => {
    mocks.settings = { ...SETTINGS, name: '  ', slogan: '', favicon: null }
    mocks.config = configWith({ STORE_PRESET: 'carpet' })
    const metadata = await generateMetadata()
    expect(metadata.title).toEqual({ default: 'فرش', template: '%s | فرش' })
    expect(metadata).not.toHaveProperty('description')
    expect(metadata).not.toHaveProperty('icons')
  })

  it('colours the browser chrome with the primary colour', async () => {
    mocks.config = configWith({ THEME_PRIMARY: '#0E7490' })
    expect(await generateViewport()).toEqual({ themeColor: '#0E7490' })
  })

  it("colours it with the panel's primary colour when the operator chose one", async () => {
    mocks.config = configWith({ THEME_PRIMARY: '#0E7490' })
    mocks.settings = { ...SETTINGS, primary_color: '#1d4ed8', secondary_color: null }
    expect(await generateViewport()).toEqual({ themeColor: '#1d4ed8' })
  })
})

describe('RootLayout', () => {
  it('renders the RTL document with the font variable, theme and snippet slots', async () => {
    const tree = (await RootLayout({ children: <main>محتوا</main> })) as Element
    expect(tree.type).toBe('html')
    expect(tree.props).toMatchObject({ lang: 'fa', dir: 'rtl', className: 'vazirmatn-variable' })

    const [head, body] = elements(tree.props.children).filter(
      (element) => element.type === 'head' || element.type === 'body',
    )
    const headChildren = elements(head?.props.children)
    expect(headChildren.find((element) => element.type === ThemeHead)?.props.theme).toEqual(
      mocks.config.theme,
    )
    expect(headChildren.find((element) => element.type === Snippets)?.props.position).toBe(
      'in_head',
    )

    const bodyChildren = ([] as ReactNode[])
      .concat(body?.props.children)
      .filter(isValidElement) as Element[]
    expect(bodyChildren.map((element) => [element.type, element.props.position])).toEqual([
      // The skip link is the first focusable element, before any operator HTML.
      [SkipLink, undefined],
      [SnippetHtmlZone, 'top'],
      [Snippets, 'top_of_body'],
      [Providers, undefined],
      // The service worker's registration (inline, FEATURE_PWA): after the app, before the
      // operator's last scripts.
      [RegisterServiceWorker, undefined],
      // The bottom zone (trust seals) is placed by the shop footer, not here (R8).
      [Snippets, 'bottom_of_body'],
    ])
  })

  it.each([
    ['on', '1', true],
    ['off', '0', false],
  ])(
    'registers the service worker with FEATURE_PWA %s (read at request time)',
    async (_, flag, on) => {
      mocks.config = configWith({ FEATURE_PWA: flag })
      const tree = await RootLayout({ children: null })
      const register = elements(tree).find((element) => element.type === RegisterServiceWorker)
      expect(register?.props.enabled).toBe(on)
    },
  )

  it('labels the skip link from the dictionary, with operator overrides', async () => {
    const tree = await RootLayout({ children: null })
    const skip = elements(tree).find((element) => element.type === SkipLink)
    expect(skip?.props.label).toBe('رفتن به محتوای اصلی')
    expect(renderToStaticMarkup(<SkipLink label="پرش به محتوا" />)).toMatch(
      /^<a href="#main" class="[^"]*sr-only[^"]*focus:not-sr-only[^"]*">پرش به محتوا<\/a>$/,
    )
  })

  it("draws the theme with the panel's colours over the store's own", async () => {
    mocks.config = configWith({ THEME_PRIMARY: '#0E7490', THEME_ACCENT: '#F59E0B' })
    mocks.settings = { ...SETTINGS, primary_color: '#1d4ed8', secondary_color: '#be123c' }
    const tree = await RootLayout({ children: null })
    const head = elements(tree).find((element) => element.type === ThemeHead)
    expect(head?.props.theme).toEqual({
      ...mocks.config.theme,
      primary: '#1d4ed8',
      accent: '#be123c',
    })
    const css = renderToStaticMarkup(<ThemeHead theme={head?.props.theme as never} />)
    expect(css).toContain('--brand-600:')
    expect(css).not.toContain('#0E7490')
  })

  it('starts the snippets request together with the other loaders', async () => {
    mocks.getSnippets.mockClear()
    // The tree is not rendered here, so only the layout itself can have called it.
    await RootLayout({ children: null })
    expect(mocks.getSnippets).toHaveBeenCalledTimes(1)
  })

  it('passes the public config, features, translations and session flag to the providers', async () => {
    mocks.cookies.add('ff_auth')
    const tree = await RootLayout({ children: <main>محتوا</main> })
    const providers = elements(tree).find((element) => element.type === Providers)
    expect(providers?.props).toMatchObject({
      features,
      translations: { cart: 'سبد من' },
      hasSession: true,
    })
    const config = providers?.props.config as Record<string, unknown>
    expect(config).not.toHaveProperty('apiUrl')
    expect(config.mediaOrigin).toBe('https://api.shop.ir')
    expect(JSON.stringify(providers?.props)).not.toContain('secret-key')
  })

  it("passes the settings' auth block to the providers", async () => {
    const auth: AuthSettings = {
      google_login_enabled: false,
      google_client_id: null,
      sms_otp_enabled: true,
      telegram_otp_enabled: false,
      available_otp_methods: ['email', 'sms'],
      registration_methods: ['email', 'phone'],
      default_otp_methods: { email: 'email', phone: 'sms' },
    }
    mocks.settings = { ...SETTINGS, auth }
    const tree = await RootLayout({ children: null })
    const providers = elements(tree).find((element) => element.type === Providers)
    expect(providers?.props.auth).toEqual(auth)
  })

  it('without settings, offers no sign-in method at all', async () => {
    mocks.settings = null
    const tree = await RootLayout({ children: null })
    const providers = elements(tree).find((element) => element.type === Providers)
    expect(providers?.props.auth).toMatchObject({
      google_login_enabled: false,
      available_otp_methods: [],
      registration_methods: [],
    })
  })

  it('has no session without the ff_auth flag', async () => {
    const tree = await RootLayout({ children: null })
    const providers = elements(tree).find((element) => element.type === Providers)
    expect(providers?.props.hasSession).toBe(false)
  })
})

describe('ThemeHead', () => {
  it('emits the theme variables only, for the bundled font', () => {
    const html = renderToStaticMarkup(<ThemeHead theme={configWith().theme} />)
    expect(html).toMatch(/^<style id="theme-vars">:root\{--brand-50:/)
    expect(html).not.toContain('@font-face')
    expect(html).not.toContain('<link')
  })

  it('loads the custom font with Vazirmatn as the fallback when THEME_FONT=custom', () => {
    const theme = configWith({ THEME_FONT: 'custom' }).theme
    const html = renderToStaticMarkup(<ThemeHead theme={theme} />)
    expect(html).toContain(
      "@font-face{font-family:'StoreCustom';src:url('/fonts/custom/font.woff2') format('woff2');font-weight:100 900;font-display:swap}",
    )
    expect(html).toContain(":root{--font-sans:'StoreCustom',var(--font-vazirmatn),")
    const container = document.createElement('div')
    container.innerHTML = html
    const preload = container.querySelector('link[rel="preload"]')
    expect(preload).toHaveAttribute('href', '/fonts/custom/font.woff2')
    expect(preload).toHaveAttribute('as', 'font')
    expect(preload).toHaveAttribute('type', 'font/woff2')
    expect(preload).toHaveAttribute('crossorigin')
  })
})
