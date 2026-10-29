import './globals.css'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { buildRootMetadata, buildRootViewport } from '@/app/_shell/metadata'
import { ThemeHead } from '@/app/_shell/theme-head'
import { Providers } from '@/app/providers'
import { SkipLink } from '@/components/layout/skip-link'
import { getStoreConfig, toPublicConfig } from '@/config/store-config'
import { RegisterServiceWorker } from '@/features/pwa/register-sw'
import {
  disabledAuth,
  getFeatureStatus,
  getSiteSettings,
  getSnippets,
  getTranslations,
} from '@/features/settings/api'
import { SnippetHtmlZone, Snippets } from '@/features/settings/snippets'
import { getTheme } from '@/features/settings/theme'
import { COOKIE } from '@/lib/auth/cookies'
import { vazirmatn } from '@/lib/fonts'
import { createTranslator } from '@/lib/i18n/translator'

// The theme comes from runtime configuration, so the layout must not be rendered at build time.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildRootMetadata(getStoreConfig(), await getSiteSettings())
}

export async function generateViewport(): Promise<Viewport> {
  return buildRootViewport(await getTheme())
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getStoreConfig()
  // getSnippets() is started here with the rest; the snippet slots below read its cached result.
  // The settings are the ones generateMetadata read (cache()): no second request.
  const [features, translations, cookieStore, settings, theme] = await Promise.all([
    getFeatureStatus(),
    getTranslations(),
    cookies(),
    getSiteSettings(),
    getTheme(),
    getSnippets(),
  ])
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <head>
        {/* The panel's colours over the store's own (`getTheme`). */}
        <ThemeHead theme={theme} />
        <Snippets position="in_head" />
      </head>
      <body>
        {/* First focusable element of the page: before any operator HTML or script. */}
        <SkipLink label={createTranslator(translations)('skip_to_content')} />
        <SnippetHtmlZone position="top" />
        <Snippets position="top_of_body" />
        <Providers
          config={toPublicConfig(config)}
          auth={settings?.auth ?? disabledAuth()}
          features={features}
          translations={translations}
          hasSession={cookieStore.has(COOKIE.flag)}
        >
          {children}
        </Providers>
        {/* The service worker's registration (FEATURE_PWA, production): a few inline lines that
            wait for `load` and idle; no chunk to download. */}
        <RegisterServiceWorker enabled={config.features.pwa} />
        {/* The bottom HTML zone (trust seals) is in the shop footer, which renders before
            these scripts; layouts without that footer place <SnippetHtmlZone position="bottom" />. */}
        <Snippets position="bottom_of_body" />
      </body>
    </html>
  )
}
