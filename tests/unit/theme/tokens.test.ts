import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { contrastRatio } from '@/lib/theme/color'

// Guards the fixed design tokens in src/styles/globals.css (they are not generated at runtime).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')

function token(name: string): string {
  const value = new RegExp(`--color-${name}:\\s*(#[0-9a-fA-F]{6});`).exec(css)?.[1]
  if (!value) throw new Error(`Token --color-${name} is missing or not a #RRGGBB colour`)
  return value
}

const INK_SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]
const SEMANTIC = ['success', 'warning', 'danger', 'info', 'sale']

describe('fixed design tokens', () => {
  it('defines a monotonic ink scale from light to dark', () => {
    const contrastOnWhite = INK_SHADES.map((shade) =>
      contrastRatio(token(`ink-${shade}`), '#FFFFFF'),
    )
    for (let i = 1; i < contrastOnWhite.length; i++) {
      expect(contrastOnWhite[i]).toBeGreaterThan(contrastOnWhite[i - 1]!)
    }
  })

  it('keeps body and secondary text readable on the page background', () => {
    expect(contrastRatio(token('ink-900'), token('ink-50'))).toBeGreaterThanOrEqual(7)
    expect(contrastRatio(token('ink-500'), token('ink-50'))).toBeGreaterThanOrEqual(4.5)
  })

  it.each(SEMANTIC)('%s passes AA as text on white and as a fill under its -fg colour', (name) => {
    expect(contrastRatio(token(name), '#FFFFFF')).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token(name), token('ink-50'))).toBeGreaterThanOrEqual(4.5)
    expect(contrastRatio(token(name), token(`${name}-fg`))).toBeGreaterThanOrEqual(4.5)
  })
})
