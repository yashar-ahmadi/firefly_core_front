import './globals.css'
import { getStoreConfig } from '@/config/store-config'
import { vazirmatn } from '@/lib/fonts'
import { buildThemeCss } from '@/lib/theme/css'

// The theme comes from runtime configuration, so the layout must not be rendered at build time.
export const dynamic = 'force-dynamic'

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const { theme } = getStoreConfig()
  return (
    <html lang="fa" dir="rtl" className={vazirmatn.variable}>
      <head>
        <style id="theme-vars">{buildThemeCss(theme)}</style>
      </head>
      <body>{children}</body>
    </html>
  )
}
