import { describe, expect, it } from 'vitest'
import { badgeColors } from '@/features/catalog/components/badge-colors'
import { contrastRatio, readableTextOn } from '@/lib/theme/color'

describe('badgeColors', () => {
  it('replaces a text colour below AA with a readable one, keeping the background', () => {
    // The dev «پرفروش» badge: white on orange is about 2.9:1.
    expect(contrastRatio('#FF6D00', '#FFFFFF')).toBeLessThan(4.5)
    expect(badgeColors({ badge_color: '#FF6D00', text_color: '#FFFFFF' })).toEqual({
      backgroundColor: '#FF6D00',
      color: readableTextOn('#FF6D00'),
    })
    expect(readableTextOn('#FF6D00')).toBe('#111827')
  })

  it("keeps the operator's pair when it reaches AA", () => {
    expect(badgeColors({ badge_color: '#1565C0', text_color: '#FFFFFF' })).toEqual({
      backgroundColor: '#1565C0',
      color: '#FFFFFF',
    })
    expect(badgeColors({ badge_color: '#6a1b9a', text_color: '#fff' })).toEqual({
      backgroundColor: '#6a1b9a',
      color: '#fff',
    })
  })

  it('falls back to a readable text colour when the text colour is missing or garbage', () => {
    for (const text_color of ['', 'red', '#12', 'url(x)', null, undefined]) {
      expect(badgeColors({ badge_color: '#1565C0', text_color })).toEqual({
        backgroundColor: '#1565C0',
        color: readableTextOn('#1565C0'),
      })
    }
  })

  it('accepts colours with alpha, judging contrast on their opaque part', () => {
    expect(badgeColors({ badge_color: '#FF6D00CC', text_color: '#FFFFFF' })).toEqual({
      backgroundColor: '#FF6D00CC',
      color: readableTextOn('#FF6D00'),
    })
    expect(badgeColors({ badge_color: '#1565C0FF', text_color: '#FFFFFFFF' })).toEqual({
      backgroundColor: '#1565C0FF',
      color: '#FFFFFFFF',
    })
    expect(badgeColors({ badge_color: '#15cf', text_color: '#fff' })).toEqual({
      backgroundColor: '#15cf',
      color: '#fff',
    })
  })

  it('treats a see-through text colour as unreadable: its contrast depends on what is behind', () => {
    // Half-white on blue would pass on the opaque colours (5.8:1) but reads far fainter.
    for (const text_color of ['#FFFFFF80', '#fff8', '#FFFFFFFE', '#ffff0']) {
      expect(badgeColors({ badge_color: '#1565C0', text_color })).toEqual({
        backgroundColor: '#1565C0',
        color: readableTextOn('#1565C0'),
      })
    }
    expect(badgeColors({ badge_color: '#1565C0', text_color: '#fffF' }).color).toBe('#fffF')
  })

  it('uses a neutral background when the badge colour cannot be read', () => {
    for (const badge_color of ['', 'orange', '#GGGGGG', 'javascript:x', null, undefined]) {
      const style = badgeColors({ badge_color, text_color: '#FFFFFF' })
      expect(style.backgroundColor).toBe('#1E293B')
      expect(contrastRatio(style.backgroundColor, style.color)).toBeGreaterThanOrEqual(4.5)
    }
  })
})
