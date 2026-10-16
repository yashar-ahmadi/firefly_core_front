import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/config/presets'
import { AA_TEXT, contrastRatio, generateScale } from '@/lib/theme/color'

// The picker's struck out-of-stock name sits on a chosen chip's brand-50 tint: ink-600 keeps it
// at AA on every preset's palette (ink-500 is about 4.4:1 there).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
const ink = (shade: number) =>
  new RegExp(`--color-ink-${shade}:\\s*(#[0-9a-fA-F]{6});`).exec(css)?.[1] ?? 'missing'

describe('the struck out-of-stock label on a chosen chip', () => {
  it.each(Object.values(PRESETS))('reaches AA on brand-50 for the $name preset', (preset) => {
    const brand50 = generateScale(preset.primary)[50]
    expect(contrastRatio(ink(600), brand50)).toBeGreaterThanOrEqual(AA_TEXT)
    expect(contrastRatio(ink(600), '#FFFFFF')).toBeGreaterThanOrEqual(AA_TEXT)
  })
})
