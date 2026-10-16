import type { ThemeConfig } from '@/config/resolve-store-config'
import { buildCustomFontCss, CUSTOM_FONT_URL } from '@/lib/theme/custom-font'
import { buildThemeCss } from '@/lib/theme/css'

/**
 * The runtime theme for <head>: the token variables and, with THEME_FONT=custom, the shop's own
 * font (see src/lib/theme/custom-font.ts) with a preload so text does not wait for the CSS.
 */
export function ThemeHead({ theme }: { theme: ThemeConfig }) {
  const custom = theme.font === 'custom'
  return (
    <>
      <style id="theme-vars">{buildThemeCss(theme) + (custom ? buildCustomFontCss() : '')}</style>
      {custom && (
        <link rel="preload" as="font" type="font/woff2" crossOrigin="" href={CUSTOM_FONT_URL} />
      )}
    </>
  )
}
