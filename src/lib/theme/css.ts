import type { ThemeConfig } from '@/config/resolve-store-config'
import { generateScale, readableTextOn, SHADES } from './color'

// Turns the resolved theme into one :root block of CSS variables. Tailwind's `@theme inline`
// block (src/styles/globals.css) maps utilities onto these variables, so a different shop only
// needs different env values, not a rebuild.

type RadiusScale = ThemeConfig['radius']
type ShadowStyle = ThemeConfig['shadow']

const PILL = '9999px'

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
    `--radius-control: ${radius.control}`,
    `--radius-card: ${radius.card}`,
    `--radius-pill: ${PILL}`,
    `--shadow-card: ${shadow.card}`,
    `--shadow-raised: ${shadow.raised}`,
  ]
  return `:root{${declarations.join(';')}}`
}
