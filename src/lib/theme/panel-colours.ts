import type { ThemeConfig } from '@/config/resolve-store-config'
import type { SiteSettings } from '@/lib/api/types/settings'
import { AA_TEXT, contrastRatio, darkenUntil, generateScale, readableTextOn } from './color'
import { focusColour, PAGE_BACKGROUND } from './css'

// The theme colours an operator picks in the panel («رنگ‌بندی قالب»: the settings' `primary_color`
// and `secondary_color`, settings digest §3.3) over the store's own (THEME_PRIMARY and
// THEME_ACCENT, else the preset's). Pure: the layout, the viewport, the manifest and the app icons
// all read the theme through `withPanelColours`.

/** The API's shape (`#rrggbb`); `#rgb` and capitals are tolerated, anything else is unset. */
const HEX6 = /^#[0-9a-f]{6}$/i
const HEX3 = /^#[0-9a-f]{3}$/i

const WHITE = '#ffffff'
/** ink-100, a rail's track (globals.css; the contrast test reads it from there). */
const INK_100 = '#f1f5f9'
/** A boundary, a marker or an icon that carries meaning (WCAG 1.4.11). */
const NON_TEXT = 3

/** A panel colour as `#rrggbb`, or null when unset or not a hex colour. */
export function panelColour(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const colour = value.trim()
  if (HEX6.test(colour)) return colour.toLowerCase()
  if (HEX3.test(colour)) {
    return `#${[...colour.slice(1)].map((digit) => digit + digit).join('')}`.toLowerCase()
  }
  return null
}

/**
 * Whether a primary colour keeps every pair the shop draws with it readable (the pairs
 * tests/unit/theme/preset-pairs.ts checks for the presets): the brand itself 4.5:1 on white
 * (CUSTOMIZATION's rule for a primary colour), its button text on it hovered and pressed, links
 * and soft badges on white, the page and its own tints, the rail's marker and the focus ring 3:1.
 */
export function primaryReads(hex: string): boolean {
  const scale = generateScale(hex)
  const fg = readableTextOn(scale[600])
  const text: [string, string][] = [
    [fg, scale[600]],
    [fg, scale[700]],
    [fg, scale[800]],
    [scale[600], WHITE],
    [scale[700], WHITE],
    [scale[700], PAGE_BACKGROUND],
    [scale[800], WHITE],
    [scale[800], scale[50]],
    [scale[800], scale[100]],
    [scale[800], scale[200]],
    [scale[700], scale[50]],
    [scale[900], scale[50]],
  ]
  const nonText: [string, string][] = [
    [scale[600], INK_100],
    [focusColour(hex), PAGE_BACKGROUND],
  ]
  return (
    text.every(([a, b]) => contrastRatio(a, b) >= AA_TEXT) &&
    nonText.every(([a, b]) => contrastRatio(a, b) >= NON_TEXT)
  )
}

/** Whether a secondary (accent) colour keeps its solid and soft badges readable. */
export function accentReads(hex: string): boolean {
  const scale = generateScale(hex)
  return (
    contrastRatio(readableTextOn(scale[600]), scale[600]) >= AA_TEXT &&
    contrastRatio(scale[900], scale[50]) >= AA_TEXT
  )
}

/**
 * The store's theme with the panel's colours over its primary and accent. A panel colour too
 * light to read as the shop draws it (a yellow primary on white) keeps its hue and is darkened
 * just enough (`darkenUntil`), so an operator's choice can never make the shop unreadable;
 * null, missing or malformed values leave the store's own colour.
 */
export function withPanelColours(
  theme: ThemeConfig,
  settings: Partial<Pick<SiteSettings, 'primary_color' | 'secondary_color'>> | null,
): ThemeConfig {
  const primary = panelColour(settings?.primary_color)
  const accent = panelColour(settings?.secondary_color)
  if (primary === null && accent === null) return theme
  return {
    ...theme,
    primary: primary === null ? theme.primary : darkenUntil(primary, primaryReads),
    accent: accent === null ? theme.accent : darkenUntil(accent, accentReads),
  }
}
