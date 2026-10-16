import { describe, expect, it } from 'vitest'
import { promoTone, SCRIM, scrimOver } from '@/features/home/promo-tone'
import { AA_TEXT, contrastRatio } from '@/lib/theme/color'

const WHITE = '#FFFFFF'
const BLACK = '#000000'

describe('promoTone', () => {
  it('puts the default white text on the dark scrim', () => {
    expect(promoTone('')).toEqual({ scrim: 'dark', color: WHITE })
    expect(promoTone('   ')).toEqual({ scrim: 'dark', color: WHITE })
  })

  it("keeps the operator's light colour on the dark scrim", () => {
    expect(promoTone('#FFFFFF')).toEqual({ scrim: 'dark', color: '#FFFFFF' })
    expect(promoTone('#fde68a')).toEqual({ scrim: 'dark', color: '#fde68a' })
    expect(promoTone('#fff')).toEqual({ scrim: 'dark', color: '#fff' })
  })

  it("keeps the operator's dark colour on the light scrim", () => {
    expect(promoTone('#111827')).toEqual({ scrim: 'light', color: '#111827' })
    expect(promoTone('#1E3A8A')).toEqual({ scrim: 'light', color: '#1E3A8A' })
  })

  it('replaces a colour no scrim makes readable, or one that is not a hex colour', () => {
    // Mid orange: under 4.5:1 on both scrims over the worst image behind them.
    expect(promoTone('#FF6D00')).toEqual({ scrim: 'dark', color: WHITE })
    expect(promoTone('red')).toEqual({ scrim: 'dark', color: WHITE })
    expect(promoTone('#12345')).toEqual({ scrim: 'dark', color: WHITE })
  })

  it('always gives AA contrast over a white or a black image', () => {
    for (const input of ['', '#FFFFFF', '#fde68a', '#111827', '#1E3A8A', '#FF6D00', '#808080']) {
      const { scrim, color } = promoTone(input)
      const hex = color.length === 4 ? `#${[...color.slice(1)].map((d) => d + d).join('')}` : color
      for (const image of [WHITE, BLACK]) {
        expect(contrastRatio(hex, scrimOver(SCRIM[scrim], image))).toBeGreaterThanOrEqual(AA_TEXT)
      }
    }
  })
})

describe('scrimOver', () => {
  it('composites the scrim colour over an image colour', () => {
    expect(scrimOver({ rgb: [0, 0, 0], alpha: 0.5 }, WHITE)).toBe('#808080')
    expect(scrimOver({ rgb: [255, 255, 255], alpha: 1 }, BLACK)).toBe('#FFFFFF')
  })
})
