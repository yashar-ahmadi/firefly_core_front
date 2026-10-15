import { describe, expect, it } from 'vitest'
import { PRESETS } from '@/config/presets'
import { contrastRatio, generateScale, readableTextOn, type Shade } from '@/lib/theme/color'

const SHADES: Shade[] = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]

// Independent reference implementation (Ottosson's OKLab matrices) so the test does not
// share bugs with the production code.
function channel(hex: string, i: number): number {
  const c = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}
function luminance(hex: string): number {
  return 0.2126 * channel(hex, 0) + 0.7152 * channel(hex, 1) + 0.0722 * channel(hex, 2)
}
function oklab(hex: string): [number, number, number] {
  const [r, g, b] = [channel(hex, 0), channel(hex, 1), channel(hex, 2)]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function deltaE(a: string, b: string): number {
  const [l1, a1, b1] = oklab(a)
  const [l2, a2, b2] = oklab(b)
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2)
}
function hueDegrees(hex: string): number {
  const [, a, b] = oklab(hex)
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}
function hueGap(a: number, b: number): number {
  const d = Math.abs(a - b) % 360
  return d > 180 ? 360 - d : d
}

/** Every #rrggbb colour whose channels step through 0..255 by `step` (step 17 gives 16 levels). */
function gridColours(step: number): string[] {
  const levels: number[] = []
  for (let v = 0; v <= 255; v += step) levels.push(v)
  const hex = (v: number) => v.toString(16).padStart(2, '0')
  return levels.flatMap((r) =>
    levels.flatMap((g) => levels.map((b) => `#${hex(r)}${hex(g)}${hex(b)}`)),
  )
}

const HEX = /^#[0-9a-f]{6}$/

describe('generateScale', () => {
  const scale = generateScale('#2563EB')

  it('returns the eleven shades as #rrggbb strings', () => {
    expect(Object.keys(scale).map(Number)).toEqual(SHADES)
    for (const shade of SHADES) expect(scale[shade]).toMatch(HEX)
  })

  it('gets strictly darker from 50 to 950', () => {
    for (let i = 1; i < SHADES.length; i++) {
      expect(luminance(scale[SHADES[i]!])).toBeLessThan(luminance(scale[SHADES[i - 1]!]))
    }
  })

  it('keeps shade 600 within ΔE 0.04 of the input', () => {
    expect(deltaE(scale[600], '#2563EB')).toBeLessThan(0.04)
  })

  it('reproduces mid-lightness inputs at shade 600', () => {
    for (const hex of ['#4F46E5', '#15803D', '#0E7490', '#8B1E3F', '#F43F5E']) {
      expect(deltaE(generateScale(hex)[600], hex)).toBeLessThan(0.01)
    }
  })

  it('accepts lower case input and is deterministic', () => {
    expect(generateScale('#2563eb')).toEqual(scale)
  })

  it('keeps the hue while mapping into the sRGB gamut', () => {
    // A dark yellow cannot hold the input chroma; lowering chroma must not rotate the hue.
    for (const hex of ['#FACC15', '#7C3AED', '#C8A24A']) {
      const hue = hueDegrees(hex)
      const result = generateScale(hex)
      for (const shade of [300, 400, 500, 600, 700, 800, 900] as const) {
        expect(hueGap(hueDegrees(result[shade]), hue)).toBeLessThan(6)
      }
    }
  })

  it('makes light shades pale and dark shades deep', () => {
    expect(oklab(scale[50])[0]).toBeGreaterThan(0.95)
    expect(oklab(scale[950])[0]).toBeLessThan(0.3)
  })

  it('stays strictly monotonic for every preset colour and for extreme inputs', () => {
    const inputs = [
      ...Object.values(PRESETS).flatMap((p) => [p.primary, p.accent]),
      '#FFFFFF',
      '#000000',
      '#FACC15',
      '#FEFEFE',
      '#010101',
      '#808080',
      '#FFFF00',
      '#00FFFF',
      '#0A0A2A',
      '#FF0000',
    ]
    for (const hex of inputs) {
      const result = generateScale(hex)
      for (let i = 1; i < SHADES.length; i++) {
        expect(result[SHADES[i]!], hex).toMatch(HEX)
        expect(luminance(result[SHADES[i]!]), hex).toBeLessThan(luminance(result[SHADES[i - 1]!]))
      }
    }
  })

  it('stays strictly monotonic over a sweep of hues and lightness levels', () => {
    for (let hue = 0; hue < 360; hue += 20) {
      for (const [l, c] of [
        [0.35, 0.1],
        [0.55, 0.2],
        [0.75, 0.12],
        [0.9, 0.06],
      ] as const) {
        // Build an input from OKLCH by way of an HSL-ish approximation: any valid hex will do.
        const k = Math.round(l * 255)
        const r = Math.max(
          0,
          Math.min(255, Math.round(k + c * 255 * Math.cos((hue * Math.PI) / 180))),
        )
        const g = Math.max(
          0,
          Math.min(255, Math.round(k + c * 255 * Math.cos(((hue - 120) * Math.PI) / 180))),
        )
        const b = Math.max(
          0,
          Math.min(255, Math.round(k + c * 255 * Math.cos(((hue + 120) * Math.PI) / 180))),
        )
        const hex = `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
        const result = generateScale(hex)
        for (let i = 1; i < SHADES.length; i++) {
          expect(luminance(result[SHADES[i]!]), hex).toBeLessThan(luminance(result[SHADES[i - 1]!]))
        }
      }
    }
  })

  it('rejects anything that is not a #RRGGBB colour', () => {
    for (const bad of ['', 'red', '#fff', '#12345', '#GGGGGG', '2563EB', 'red;}body{x:y']) {
      expect(() => generateScale(bad), bad).toThrow()
    }
  })
})

describe('contrastRatio', () => {
  it('is 21 for black on white and 1 for identical colours', () => {
    expect(contrastRatio('#FFFFFF', '#000000')).toBeCloseTo(21, 5)
    expect(contrastRatio('#336699', '#336699')).toBeCloseTo(1, 5)
  })

  it('is symmetric', () => {
    expect(contrastRatio('#2563EB', '#FFFFFF')).toBeCloseTo(contrastRatio('#FFFFFF', '#2563EB'), 10)
  })

  it('matches published WCAG reference values', () => {
    expect(contrastRatio('#777777', '#FFFFFF')).toBeCloseTo(4.48, 2)
    expect(contrastRatio('#2563EB', '#FFFFFF')).toBeCloseTo(5.17, 2)
  })
})

describe('readableTextOn', () => {
  it('picks dark text on light colours and white text on dark colours', () => {
    expect(readableTextOn('#FACC15')).toBe('#111827')
    expect(readableTextOn('#4F46E5')).toBe('#FFFFFF')
    expect(readableTextOn('#FFFFFF')).toBe('#111827')
    expect(readableTextOn('#000000')).toBe('#FFFFFF')
  })

  it('always returns the option with the higher contrast', () => {
    for (const p of Object.values(PRESETS)) {
      for (const hex of [p.primary, p.accent]) {
        const picked = readableTextOn(hex)
        const other = picked === '#FFFFFF' ? '#111827' : '#FFFFFF'
        expect(contrastRatio(hex, picked), hex).toBeGreaterThanOrEqual(contrastRatio(hex, other))
      }
    }
  })

  it('falls back to black for mid-luminance fills where white and #111827 both miss 4.5:1', () => {
    // Relative luminance between about 0.183 and 0.219: white tops out near 4.2:1.
    for (const hex of ['#c34bb4', '#967800', '#e100c3']) {
      expect(contrastRatio(hex, '#FFFFFF'), hex).toBeLessThan(4.5)
      expect(contrastRatio(hex, '#111827'), hex).toBeLessThan(4.5)
      expect(readableTextOn(hex), hex).toBe('#000000')
    }
  })

  it('keeps white or #111827 whenever one of them reaches 4.5:1', () => {
    for (const hex of gridColours(51)) {
      const white = contrastRatio(hex, '#FFFFFF')
      const dark = contrastRatio(hex, '#111827')
      if (Math.max(white, dark) >= 4.5) {
        expect(readableTextOn(hex), hex).toBe(white >= dark ? '#FFFFFF' : '#111827')
      }
    }
  })

  it('reaches WCAG AA on every 600 shade over a coarse RGB grid', () => {
    for (const input of gridColours(17)) {
      const fill = generateScale(input)[600]
      expect(
        contrastRatio(fill, readableTextOn(fill)),
        `${input} -> ${fill}`,
      ).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('reaches WCAG AA on the 600 shade of all twelve preset colours', () => {
    const colours = Object.values(PRESETS).flatMap((p) => [p.primary, p.accent])
    expect(colours).toHaveLength(12)
    for (const input of colours) {
      const fill = generateScale(input)[600]
      expect(contrastRatio(fill, readableTextOn(fill)), input).toBeGreaterThanOrEqual(4.5)
    }
  })
})
