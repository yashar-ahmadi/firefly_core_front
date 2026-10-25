// @vitest-environment node
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it, vi } from 'vitest'
import { monogramGlyph, monogramSvg } from '@/features/pwa/monogram'
import { MONOGRAM_GLYPHS } from '@/features/pwa/monogram-glyphs'
import { glyphTable } from '../../../scripts/monogram-glyphs.mjs'

vi.mock('server-only', () => ({}))

// The app icons' monogram (`/icons/<size>/` without a favicon or logo, Plan 5 final fix wave
// round 2): the shop's first letter, white on the brand colour, drawn as an SVG path from the
// bundled Vazirmatn's outlines (src/features/pwa/monogram-glyphs.ts, made by
// scripts/monogram-glyphs.mjs). No text is laid out, so no font is needed at run time: in the
// Docker image (Alpine, no fontconfig) sharp's text layout drew nothing and the icon was blank.

const PERSIAN = [...'اآبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی']
const LATIN = [...'ABCDEFGHIJKLMNOPQRSTUVWXYZ']
const DIGITS = [...'0123456789۰۱۲۳۴۵۶۷۸۹']
/** Lucide's shopping bag, the mark for a first character the table lacks. */
const BAG = 'M16 10a4 4 0 0 1-8 0'

/** The white pixels of the monogram rendered at `size`, and their bounding box. */
async function ink(svg: string, size: number) {
  const { data, info } = await sharp(Buffer.from(svg)).raw().toBuffer({ resolveWithObject: true })
  expect([info.width, info.height]).toEqual([size, size])
  let count = 0
  const box = { left: size, top: size, right: -1, bottom: -1 }
  for (let at = 0; at < size * size; at += 1) {
    const [r, g, b] = data.subarray(at * info.channels, at * info.channels + 3)
    if (r! < 200 || g! < 200 || b! < 200) continue
    count += 1
    const x = at % size
    const y = Math.floor(at / size)
    box.left = Math.min(box.left, x)
    box.right = Math.max(box.right, x)
    box.top = Math.min(box.top, y)
    box.bottom = Math.max(box.bottom, y)
  }
  return { count, box, corner: [...data.subarray(0, 3)] }
}

describe('the glyph table (from the bundled Vazirmatn)', () => {
  const chars = MONOGRAM_GLYPHS.map((entry) => entry.split(' ')[0])

  it('is what the script makes from the font (never edited by hand)', () => {
    expect(readFileSync('src/features/pwa/monogram-glyphs.ts', 'utf8')).toBe(glyphTable())
  })

  it('has the Persian alphabet, the Latin capitals and the digits, each once', () => {
    expect(chars).toEqual(expect.arrayContaining([...PERSIAN, ...LATIN, ...DIGITS]))
    expect(new Set(chars).size).toBe(chars.length)
  })

  it('each outline: its longer side 1000 units, a path of moves, lines and curves only', () => {
    for (const entry of MONOGRAM_GLYPHS) {
      const [char, width, height, ...path] = entry.split(' ')
      expect(Math.max(Number(width), Number(height)), char).toBe(1000)
      expect(Math.min(Number(width), Number(height)), char).toBeGreaterThan(0)
      expect(path.join(' '), char).toMatch(/^M[-\d ]+(?:[MLQCZ][-\d ]*)+$/)
    }
  })
})

describe('monogramGlyph: the first character, as people read the name', () => {
  it('the first letter of a Persian name', () => {
    expect(monogramGlyph('فایرفلای')?.char).toBe('ف')
    expect(monogramGlyph('آوا')?.char).toBe('آ')
  })

  it('skips leading spaces and invisible marks; a small Latin letter is drawn as its capital', () => {
    expect(monogramGlyph('  ‏‌فروشگاه')?.char).toBe('ف')
    expect(monogramGlyph('shop')?.char).toBe('S')
    expect(monogramGlyph('Shop')?.char).toBe('S')
    expect(monogramGlyph('۲۴ ساعته')?.char).toBe('۲')
  })

  it('a character the table lacks, or no name: none', () => {
    for (const name of ['🛍 shop', '中文', 'Émile', '', '   '])
      expect(monogramGlyph(name)).toBeNull()
  })
})

describe('monogramSvg', () => {
  it('the letter as a white path on the brand colour: no text, no font', () => {
    const svg = monogramSvg('فایرفلای', '#0e7490', 512)
    expect(svg).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="512" height="512"/)
    expect(svg).toContain('<rect width="512" height="512" fill="#0e7490"/>')
    expect(svg).toContain('<path fill="#ffffff"')
    expect(svg).not.toMatch(/<text|font/i)
    expect(svg).not.toContain(BAG)
  })

  it('without a letter it can draw: the shopping bag, white on the brand colour', () => {
    const svg = monogramSvg('🛍', '#0e7490', 192)
    expect(svg).toContain('fill="#0e7490"')
    expect(svg).toContain(BAG)
    expect(svg).not.toMatch(/<text|font/i)
  })

  it.each(['فایرفلای', 'ا', 'ب', 'گ', 'Shop', '۸'])(
    '%s, rendered at 512: white ink filling the central half, on the brand colour',
    async (name) => {
      const { count, box, corner } = await ink(monogramSvg(name, '#0e7490', 512), 512)
      expect(corner).toEqual([0x0e, 0x74, 0x90])
      expect(count).toBeGreaterThan(1_000)
      // Inside the central 256 px square (a maskable icon's safe circle holds it whole), its
      // longer side the square's.
      for (const edge of [box.left, box.top]) expect(edge).toBeGreaterThanOrEqual(127)
      for (const edge of [box.right, box.bottom]) expect(edge).toBeLessThanOrEqual(384)
      const longer = Math.max(box.right - box.left, box.bottom - box.top) + 1
      expect(longer).toBeGreaterThanOrEqual(250)
      // Centred: the same margin either side of its longer side, to a pixel or two.
      const margins =
        box.right - box.left > box.bottom - box.top
          ? [box.left, 511 - box.right]
          : [box.top, 511 - box.bottom]
      expect(Math.abs(margins[0]! - margins[1]!)).toBeLessThanOrEqual(2)
    },
  )

  it('every glyph of the table draws, at 192 px', async () => {
    for (const entry of MONOGRAM_GLYPHS) {
      const char = entry.split(' ')[0]!
      expect((await ink(monogramSvg(char, '#4f46e5', 192), 192)).count, char).toBeGreaterThan(50)
    }
  })
})
