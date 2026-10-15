import { describe, expect, it } from 'vitest'
import type { ThemeConfig } from '@/config/resolve-store-config'
import { generateScale, readableTextOn } from '@/lib/theme/color'
import { buildThemeCss } from '@/lib/theme/css'

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

  it.each([
    ['sm', '.375rem', '.5rem'],
    ['md', '.5rem', '.75rem'],
    ['lg', '.75rem', '1rem'],
    ['xl', '1rem', '1.5rem'],
  ] as const)('maps radius %s to control %s and card %s', (radius, control, card) => {
    const out = buildThemeCss({ ...theme, radius })
    expect(declaration(out, '--radius-control')).toBe(control)
    expect(declaration(out, '--radius-card')).toBe(card)
    expect(declaration(out, '--radius-pill')).toBe('9999px')
  })

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
