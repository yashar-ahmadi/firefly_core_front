import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Preset } from '@/config/presets'
import { contrastRatio } from '@/lib/theme/color'
import { buildThemeCss } from '@/lib/theme/css'

// The colour pairs the storefront draws with a preset's brand and accent (Plan 5 Task 9's
// contrast pass): each text or control colour on its background, as the shop ships it (the
// variables `buildThemeCss` writes for the preset), with WCAG 2.x AA's floor for it: 4.5:1 for
// text (the store name, links, buttons, badges, chips, tabs, the announcement), 3:1 for a
// control's boundary, a state marker or an icon that carries meaning. Used by
// preset-contrast.test.ts (the guard) and to print the table in docs/CUSTOMIZATION.md.

const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
const ink = (shade: number) =>
  new RegExp(`--color-ink-${shade}:\\s*(#[0-9a-fA-F]{6});`).exec(css)?.[1] ?? 'missing'

const WHITE = '#ffffff'

export interface ContrastPair {
  /** What draws it (Persian UI names in the docs table; English here). */
  name: string
  fg: string
  bg: string
  /** The variables, for the table. */
  tokens: string
  min: 4.5 | 3
}

/** The theme variables a preset ships (`--brand-600`, `--brand-fg`, `--focus`…). */
export function themeVariables(preset: Preset): Record<string, string> {
  const out = buildThemeCss({
    primary: preset.primary,
    accent: preset.accent,
    radius: preset.radius,
    shadow: preset.shadow,
    font: 'vazirmatn',
    motion: preset.motion,
    cardStyle: preset.cardStyle,
  })
  return Object.fromEntries(
    [...out.matchAll(/--([a-z0-9-]+):\s*([^;}]+)/g)].map(([, key, value]) => [key, value!.trim()]),
  )
}

export function presetPairs(preset: Preset): ContrastPair[] {
  const v = themeVariables(preset)
  const pair = (name: string, fg: string, bg: string, min: 4.5 | 3): ContrastPair => ({
    name,
    fg: v[fg] ?? fg,
    bg: v[bg] ?? bg,
    tokens: `${fg} / ${bg}`,
    min,
  })
  return [
    pair('primary button, solid brand badge, count badge, active step', 'brand-fg', 'brand', 4.5),
    pair('primary button, hovered', 'brand-fg', 'brand-700', 4.5),
    pair('primary button, pressed', 'brand-fg', 'brand-800', 4.5),
    pair('store name, links, active nav', 'brand-700', WHITE, 4.5),
    pair('links on the page background', 'brand-700', ink(50), 4.5),
    pair('active tab, hovered link', 'brand-800', WHITE, 4.5),
    pair('soft brand badge, chosen chip, secondary button', 'brand-800', 'brand-50', 4.5),
    pair('secondary button hovered, avatar letter', 'brand-800', 'brand-100', 4.5),
    pair('secondary button, pressed', 'brand-800', 'brand-200', 4.5),
    pair('icon circles, status tones', 'brand-700', 'brand-50', 4.5),
    pair('announcement bar', 'brand-900', 'brand-50', 4.5),
    pair('solid accent badge', 'accent-fg', 'accent', 4.5),
    pair('soft accent badge, dashboard tone', 'accent-900', 'accent-50', 4.5),
    pair('chosen chip border, brand icons, checkbox', 'brand', WHITE, 3),
    pair('active tab marker on the rail', 'brand', ink(100), 3),
    pair('focus ring on the page', 'focus', ink(50), 3),
  ]
}

export const ratio = (pair: ContrastPair) => contrastRatio(pair.fg, pair.bg)
