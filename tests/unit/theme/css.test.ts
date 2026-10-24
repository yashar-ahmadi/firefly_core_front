import { describe, expect, it } from 'vitest'
import type { ThemeConfig } from '@/config/resolve-store-config'
import { PRESETS } from '@/config/presets'
import { contrastRatio, generateScale, readableTextOn } from '@/lib/theme/color'
import { buildThemeCss, PAGE_BACKGROUND } from '@/lib/theme/css'

const theme: ThemeConfig = {
  primary: '#4F46E5',
  accent: '#FACC15',
  radius: 'lg',
  shadow: 'soft',
  font: 'vazirmatn',
  motion: 'calm',
  cardStyle: 'elevated',
}

const SHADES = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950] as const

/** Reads one declaration out of the generated block. */
function declaration(css: string, name: string): string | undefined {
  return new RegExp(`(?:^|[{;])${name}: ([^;}]+)`).exec(css)?.[1]
}

describe('buildThemeCss', () => {
  const css = buildThemeCss(theme)

  it('returns a single :root block', () => {
    expect(css.startsWith(':root{')).toBe(true)
    expect(css.endsWith('}')).toBe(true)
    expect(css.match(/\{/g)).toHaveLength(1)
    expect(css.match(/\}/g)).toHaveLength(1)
  })

  it('declares the brand and accent scales plus their short forms', () => {
    expect(css).toContain('--brand-600:')
    expect(css).toContain('--radius-card:')
    const brand = generateScale(theme.primary)
    const accent = generateScale(theme.accent)
    for (const shade of SHADES) {
      expect(declaration(css, `--brand-${shade}`)).toBe(brand[shade])
      expect(declaration(css, `--accent-${shade}`)).toBe(accent[shade])
    }
    expect(declaration(css, '--brand')).toBe(brand[600])
    expect(declaration(css, '--accent')).toBe(accent[600])
  })

  it('derives readable foreground colours from the 600 shades', () => {
    expect(declaration(css, '--brand-fg')).toBe(readableTextOn(generateScale(theme.primary)[600]))
    expect(declaration(css, '--accent-fg')).toBe(readableTextOn(generateScale(theme.accent)[600]))
    expect(declaration(css, '--brand-fg')).toBe('#FFFFFF')
    expect(declaration(buildThemeCss({ ...theme, accent: '#FACC15' }), '--accent-fg')).toBe(
      '#111827',
    )
  })

  describe('--focus', () => {
    const FOCUS_SHADES = [500, 600, 700, 800, 900, 950] as const
    const primaries = [
      '#FACC15',
      '#0D9488',
      '#16A34A',
      '#4F46E5',
      '#2563EB',
      '#FFFFFF',
      ...Object.values(PRESETS).map((p) => p.primary),
    ]

    it.each(primaries)(
      'is the lightest brand shade from 500 down that has 3:1 on the page (%s)',
      (primary) => {
        const out = buildThemeCss({ ...theme, primary })
        const scale = generateScale(primary)
        const focus = declaration(out, '--focus')
        const passing = FOCUS_SHADES.filter((s) => contrastRatio(scale[s], PAGE_BACKGROUND) >= 3)
        expect(passing.length).toBeGreaterThan(0)
        expect(focus).toBe(scale[passing[0]!])
        expect(contrastRatio(focus!, PAGE_BACKGROUND)).toBeGreaterThanOrEqual(3)
      },
    )

    it('moves a light primary off shade 500', () => {
      const scale = generateScale('#FACC15')
      expect(contrastRatio(scale[500], PAGE_BACKGROUND)).toBeLessThan(3)
      expect(declaration(buildThemeCss({ ...theme, primary: '#FACC15' }), '--focus')).not.toBe(
        scale[500],
      )
    })

    it('keeps shade 500 when it is already visible enough', () => {
      const scale = generateScale('#2563EB')
      expect(contrastRatio(scale[500], PAGE_BACKGROUND)).toBeGreaterThanOrEqual(3)
      expect(declaration(buildThemeCss({ ...theme, primary: '#2563EB' }), '--focus')).toBe(
        scale[500],
      )
    })
  })

  it.each([
    ['sm', '.375rem', '.5rem', '.25rem'],
    ['md', '.5rem', '.75rem', '.3125rem'],
    ['lg', '.75rem', '1rem', '.4rem'],
    ['xl', '1rem', '1.5rem', '.5rem'],
  ] as const)(
    'maps radius %s to control %s, card %s and check %s',
    (radius, control, card, check) => {
      const out = buildThemeCss({ ...theme, radius })
      expect(declaration(out, '--radius-control')).toBe(control)
      expect(declaration(out, '--radius-card')).toBe(card)
      expect(declaration(out, '--radius-pill')).toBe('9999px')
      // A 24px checkbox's corners: the control's would round it into a radio on lg and xl.
      expect(declaration(out, '--radius-check')).toBe(check)
    },
  )

  it('emits --radius-card: 1.5rem for the xl scale', () => {
    expect(buildThemeCss({ ...theme, radius: 'xl' })).toContain('--radius-card: 1.5rem')
  })

  it('maps the shadow styles', () => {
    const soft = buildThemeCss({ ...theme, shadow: 'soft' })
    expect(declaration(soft, '--shadow-card')).toBe(
      '0 1px 2px rgb(15 23 42/.04),0 4px 16px rgb(15 23 42/.06)',
    )
    expect(declaration(soft, '--shadow-raised')).toBe('0 8px 30px rgb(15 23 42/.12)')
    const crisp = buildThemeCss({ ...theme, shadow: 'crisp' })
    expect(declaration(crisp, '--shadow-card')).toBe('0 1px 3px rgb(15 23 42/.1)')
    expect(declaration(crisp, '--shadow-raised')).toBe('0 6px 20px rgb(15 23 42/.16)')
  })

  it('never lets a configured string reach the stylesheet unchecked', () => {
    expect(() => buildThemeCss({ ...theme, primary: 'red;}body{display:none' })).toThrow()
    expect(() => buildThemeCss({ ...theme, accent: '</style><script>' })).toThrow()
    // @ts-expect-error unknown radius scale
    expect(() => buildThemeCss({ ...theme, radius: 'huge' })).toThrow()
    // @ts-expect-error unknown shadow style
    expect(() => buildThemeCss({ ...theme, shadow: 'glow' })).toThrow()
  })

  it('contains nothing that React would escape inside a <style> element', () => {
    for (const radius of ['sm', 'md', 'lg', 'xl'] as const) {
      for (const shadow of ['soft', 'crisp'] as const) {
        expect(buildThemeCss({ ...theme, radius, shadow })).not.toMatch(/[<>&"']/)
      }
    }
  })
})
