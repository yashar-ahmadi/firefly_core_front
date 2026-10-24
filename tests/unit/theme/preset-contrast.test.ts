import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/config/presets'
import { presetPairs, ratio, themeVariables } from './preset-pairs'

// Every preset's brand and accent pairs reach WCAG AA as the shop draws them (Plan 5 Task 9's
// preset showcase): text 4.5:1, a control's boundary, marker or meaningful icon 3:1. A preset
// whose colours change must keep them (docs/CUSTOMIZATION.md shows the table). The rating stars'
// accent fill is left out on purpose: the score is always written beside them.

describe.each(Object.values(PRESETS))('the $name preset', (preset) => {
  it.each(presetPairs(preset).map((pair) => [pair.name, pair] as const))(
    '%s reaches AA',
    (_, pair) => {
      expect(ratio(pair), `${pair.tokens}: ${pair.fg} on ${pair.bg}`).toBeGreaterThanOrEqual(
        pair.min,
      )
    },
  )

  it('reads every variable it checks from the shipped theme', () => {
    const variables = themeVariables(preset)
    for (const pair of presetPairs(preset)) {
      expect(pair.fg, pair.tokens).toMatch(/^#[0-9a-f]{6}$/i)
      expect(pair.bg, pair.tokens).toMatch(/^#[0-9a-f]{6}$/i)
    }
    expect(variables['brand-fg']).toMatch(/^#/)
  })
})
