/**
 * THEME_FONT=custom: the shop's own typeface, loaded at runtime. The operator puts one variable
 * woff2 file (wght 100-900) at public/fonts/custom/font.woff2 (served as /fonts/custom/font.woff2).
 * Vazirmatn stays the fallback, so a missing file only means the bundled font.
 */

export const CUSTOM_FONT_URL = '/fonts/custom/font.woff2'
const CUSTOM_FONT_FAMILY = 'StoreCustom'

/** The `--font-sans` stack of src/styles/globals.css (a test keeps the two in sync). */
export const FONT_FALLBACK_STACK =
  "var(--font-vazirmatn),ui-sans-serif,system-ui,'Segoe UI',Tahoma,Arial,sans-serif"

/** The @font-face rule plus a `--font-sans` override that puts the custom font first. */
export function buildCustomFontCss(): string {
  return (
    `@font-face{font-family:'${CUSTOM_FONT_FAMILY}';src:url('${CUSTOM_FONT_URL}') format('woff2');` +
    'font-weight:100 900;font-display:swap}' +
    `:root{--font-sans:'${CUSTOM_FONT_FAMILY}',${FONT_FALLBACK_STACK}}`
  )
}
