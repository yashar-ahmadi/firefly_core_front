import './globals.css'
import type { Metadata, Viewport } from 'next'
import { cookies } from 'next/headers'
import { buildRootMetadata, buildRootViewport } from '@/app/_shell/metadata'
import { ThemeHead } from '@/app/_shell/theme-head'
import { Providers } from '@/app/providers'
import { getStoreConfig, toPublicConfig } from '@/config/store-config'
import { getFeatureStatus, getSiteSettings, getTranslations } from '@/features/settings/api'
import { Snippets } from '@/features/settings/snippets'
import { COOKIE } from '@/lib/auth/cookies'
import { vazirmatn } from '@/lib/fonts'

// The theme comes from runtime configuration, so the layout must not be rendered at build time.
export const dynamic = 'force-dynamic'

export async function generateMetadata(): Promise<Metadata> {
  return buildRootMetadata(getStoreConfig(), await getSiteSettings())
}

export function generateViewport(): Viewport {
  return buildRootViewport(getStoreConfig().theme)
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const config = getStoreConfig()
  const [features, translations, cookieStore] = await Promise.all([
    getFeatureStatus(),
    getTranslations(),
    cookies(),
  ])
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <head>
        <ThemeHead theme={config.theme} />
        <Snippets position="in_head" />
      </head>
      <body>
        <Snippets position="top_of_body" />
        <Providers
          config={toPublicConfig(config)}
          features={features}
          translations={translations}
          hasSession={cookieStore.has(COOKIE.flag)}
        >
          {children}
        </Providers>
        <Snippets position="bottom_of_body" />
      </body>
    </html>
  )
}
