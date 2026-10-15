import type { ThemeConfig } from '@/config/resolve-store-config'
import { contrastRatio, generateScale, readableTextOn, SHADES } from './color'

// Turns the resolved theme into one :root block of CSS variables. Tailwind's `@theme inline`
// block (src/styles/globals.css) maps utilities onto these variables, so a different shop only
// needs different env values, not a rebuild.

type RadiusScale = ThemeConfig['radius']
type ShadowStyle = ThemeConfig['shadow']

const PILL = '9999px'

/** ink-50, the page background (keep in sync with src/styles/globals.css; a test checks it). */
export const PAGE_BACKGROUND = '#f8fafc'

/** Focus rings need 3:1 against the page (WCAG 1.4.11 non-text contrast). */
const FOCUS_MIN_CONTRAST = 3
const FOCUS_SHADES = [500, 600, 700, 800, 900, 950] as const

const RADII: Record<RadiusScale, { control: string; card: string }> = {
  sm: { control: '.375rem', card: '.5rem' },
  md: { control: '.5rem', card: '.75rem' },
  lg: { control: '.75rem', card: '1rem' },
  xl: { control: '1rem', card: '1.5rem' },
}

const SHADOWS: Record<ShadowStyle, { card: string; raised: string }> = {
  soft: {
    card: '0 1px 2px rgb(15 23 42/.04),0 4px 16px rgb(15 23 42/.06)',
    raised: '0 8px 30px rgb(15 23 42/.12)',
  },
  crisp: {
    card: '0 1px 3px rgb(15 23 42/.1)',
    raised: '0 6px 20px rgb(15 23 42/.16)',
  },
}

function lookup<T>(table: Record<string, T>, key: string, what: string): T {
  const value = Object.hasOwn(table, key) ? table[key] : undefined
  if (value === undefined) throw new Error(`Unknown ${what} "${key}"`)
  return value
}

function colourVariables(name: 'brand' | 'accent', hex: string): string[] {
  const scale = generateScale(hex)
  return [
    ...SHADES.map((shade) => `--${name}-${shade}: ${scale[shade]}`),
    `--${name}: ${scale[600]}`,
    `--${name}-fg: ${readableTextOn(scale[600])}`,
  ]
}

/** The lightest brand shade (500 and darker) that is visible enough as a focus ring. */
function focusColour(brandHex: string): string {
  const scale = generateScale(brandHex)
  const shade = FOCUS_SHADES.find(
    (s) => contrastRatio(scale[s], PAGE_BACKGROUND) >= FOCUS_MIN_CONTRAST,
  )
  return scale[shade ?? 950]
}

/**
 * The runtime theme as a single `:root{...}` rule. Every value is computed or looked up in a
 * fixed table, so nothing from the configuration reaches the stylesheet as a raw string.
 */
export function buildThemeCss(theme: ThemeConfig): string {
  const radius = lookup(RADII, theme.radius, 'radius scale')
  const shadow = lookup(SHADOWS, theme.shadow, 'shadow style')
  const declarations = [
    ...colourVariables('brand', theme.primary),
    ...colourVariables('accent', theme.accent),
    `--focus: ${focusColour(theme.primary)}`,
    `--radius-control: ${radius.control}`,
    `--radius-card: ${radius.card}`,
    `--radius-pill: ${PILL}`,
    `--shadow-card: ${shadow.card}`,
    `--shadow-raised: ${shadow.raised}`,
  ]
  return `:root{${declarations.join(';')}}`
}
