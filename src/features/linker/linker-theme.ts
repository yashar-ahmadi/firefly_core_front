import type { CSSProperties } from 'react'
import type { LinkerTheme } from '@/lib/api/types/linker'

// The linker's theme as CSS variables on its root (content digest §8: one template for every
// theme; never a branch on `theme.key`). Pure.

/** A colour or a gradient: letters, digits, `#`, `%`, `.`, `,`, `-`, spaces and parentheses. */
const PLAIN_VALUE = /^[\w\s#%.,()-]+$/
/** What a palette never holds and a style must never get: a resource, a script, a variable. */
const ACTIVE_VALUE = /\b(?:url|expression|var|image-set|element)\s*\(/i

/**
 * `value` when it is a plain colour or gradient (`#0891b2`, `transparent`,
 * `linear-gradient(#0891b2, #22d3ee)`), else `fallback`. The API's palettes are fixed in its code,
 * but a value goes into a style attribute: a `;`, a brace or a `url(` there would be a
 * declaration of its own.
 */
export function cssValue(value: string, fallback: string): string {
  const trimmed = value.trim()
  return PLAIN_VALUE.test(trimmed) && !ACTIVE_VALUE.test(trimmed) ? trimmed : fallback
}

/** The classic palette (`legacy`, the API's own default), for any value refused. */
const CLASSIC = {
  background: '#ffffff',
  text_color: '#000000',
  button_background: '#F1F5F9',
  button_text_color: '#000000',
  button_border: 'transparent',
}

/** Buttons and pictures with `rounded_edges`; square corners without. */
const RADIUS = '0.875rem'

/**
 * The root's variables: `--linker-background` (a colour or a gradient), `--linker-text`,
 * `--linker-button-background`, `--linker-button-text`, `--linker-button-border`, and
 * `--linker-radius` for buttons and pictures. The rest is derived in CSS (`color-mix`: the
 * avatar's circle, a button's hover), so every theme renders from these alone.
 */
export function linkerStyle(theme: LinkerTheme, rounded: boolean): CSSProperties {
  return {
    '--linker-background': cssValue(theme.background, CLASSIC.background),
    '--linker-text': cssValue(theme.text_color, CLASSIC.text_color),
    '--linker-button-background': cssValue(theme.button_background, CLASSIC.button_background),
    '--linker-button-text': cssValue(theme.button_text_color, CLASSIC.button_text_color),
    '--linker-button-border': cssValue(theme.button_border, CLASSIC.button_border),
    '--linker-radius': rounded ? RADIUS : '0',
  } as CSSProperties
}
