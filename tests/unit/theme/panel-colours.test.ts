import { describe, expect, it } from 'vitest'
import type { ThemeConfig } from '@/config/resolve-store-config'
import { PRESETS } from '@/config/presets'
import { contrastRatio } from '@/lib/theme/color'
import { accentReads, panelColour, primaryReads, withPanelColours } from '@/lib/theme/panel-colours'
import { presetPairs, ratio } from './preset-pairs'

const theme: ThemeConfig = {
  primary: '#4F46E5',
  accent: '#FACC15',
  radius: 'lg',
  shadow: 'soft',
  font: 'vazirmatn',
  motion: 'calm',
  cardStyle: 'elevated',
}

/** Every pair the presets are held to, for a theme made of these two colours. */
function failingPairs(primary: string, accent: string): string[] {
  const preset = { ...PRESETS.default, primary, accent }
  return presetPairs(preset)
    .filter((pair) => ratio(pair) < pair.min)
    .map((pair) => `${pair.tokens}: ${ratio(pair).toFixed(2)}`)
}

/** Hex for an HSL colour, for the sweep below. */
function hsl(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const f = (n: number) => {
    const k = (n + h / 30) % 12
    return Math.round(255 * (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))))
  }
  return `#${[f(0), f(8), f(4)].map((v) => v.toString(16).padStart(2, '0')).join('')}`
}

describe('panelColour', () => {
  it('keeps the API’s #rrggbb, lowercased', () => {
    expect(panelColour('#1a73e8')).toBe('#1a73e8')
    expect(panelColour(' #1A73E8 ')).toBe('#1a73e8')
  })

  it('expands #rgb', () => {
    expect(panelColour('#F0a')).toBe('#ff00aa')
  })

  it('reads null, blanks and anything that is not a hex colour as unset', () => {
    for (const value of [
      null,
      undefined,
      '',
      '  ',
      'red',
      '#12345',
      '#1234567',
      'rgb(1,2,3)',
      42,
    ]) {
      expect(panelColour(value)).toBeNull()
    }
  })
})

describe('withPanelColours', () => {
  it('returns the store’s own theme when the panel chose nothing', () => {
    expect(withPanelColours(theme, null)).toBe(theme)
    expect(withPanelColours(theme, { primary_color: null, secondary_color: null })).toBe(theme)
    expect(withPanelColours(theme, {})).toBe(theme)
  })

  it('puts the panel’s readable colours over the primary and the accent', () => {
    const next = withPanelColours(theme, { primary_color: '#0f766e', secondary_color: '#f59e0b' })
    expect(next).toEqual({ ...theme, primary: '#0f766e', accent: '#f59e0b' })
  })

  it('takes each colour on its own: only one may be set', () => {
    expect(withPanelColours(theme, { primary_color: '#0f766e', secondary_color: null })).toEqual({
      ...theme,
      primary: '#0f766e',
    })
    expect(withPanelColours(theme, { primary_color: null, secondary_color: '#f59e0b' })).toEqual({
      ...theme,
      accent: '#f59e0b',
    })
  })

  it('ignores a malformed value', () => {
    expect(withPanelColours(theme, { primary_color: 'blue', secondary_color: '#zzz' })).toBe(theme)
  })

  it('darkens a primary too light to read, keeping its hue', () => {
    const next = withPanelColours(theme, { primary_color: '#ffeb3b', secondary_color: null })
    expect(next.primary).not.toBe('#ffeb3b')
    expect(primaryReads(next.primary)).toBe(true)
    expect(contrastRatio(next.primary, '#ffffff')).toBeGreaterThanOrEqual(4.5)
    // Still a yellow-brown, not a grey: red above blue.
    const [r, , b] = [1, 3, 5].map((i) => parseInt(next.primary.slice(i, i + 2), 16))
    expect(r!).toBeGreaterThan(b!)
  })

  it('leaves a primary that already reads untouched', () => {
    expect(primaryReads('#4338ca')).toBe(true)
    expect(withPanelColours(theme, { primary_color: '#4338ca' }).primary).toBe('#4338ca')
  })

  // Whatever the operator picks, the shop reaches every AA pair the presets are held to.
  it.each([0, 30, 60, 90, 120, 180, 210, 240, 280, 320])(
    'makes any colour of hue %i° readable as primary and accent',
    (hue) => {
      for (const saturation of [0, 0.4, 1]) {
        for (const lightness of [0.15, 0.35, 0.5, 0.65, 0.8, 0.95]) {
          const picked = hsl(hue, saturation, lightness)
          const next = withPanelColours(theme, { primary_color: picked, secondary_color: picked })
          expect(primaryReads(next.primary), picked).toBe(true)
          expect(accentReads(next.accent), picked).toBe(true)
          expect(failingPairs(next.primary, next.accent), picked).toEqual([])
        }
      }
    },
  )
})
