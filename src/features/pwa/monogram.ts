import 'server-only'
import { MONOGRAM_GLYPHS } from '@/features/pwa/monogram-glyphs'

// The app icons' monogram (`/icons/<size>/` without a favicon or logo, app-icon.ts): the shop's
// first letter, white on the brand colour, as an SVG for sharp to rasterise. The letter is a path,
// the bundled Vazirmatn's outline (monogram-glyphs.ts, made by scripts/monogram-glyphs.mjs): no
// text is laid out, so no font is needed at run time (the Docker image has no fontconfig, and
// sharp's text layout drew nothing there). A first character the table lacks gets Lucide's
// shopping bag (ISC), which needs no font either. Server only (the table is about 37 KB).

export interface MonogramGlyph {
  char: string
  /** The outline's box, its longer side 1000 units (y down, from 0 0). */
  width: number
  height: number
  /** The outline, an SVG path in that box. */
  d: string
}

/** The letter's longer side, a share of the icon's: a maskable icon's safe circle (80 %) holds it. */
const LETTER = 0.5
/** The outlines' longer side, in the table's units. */
const BOX = 1000
/** Spaces and invisible marks (a direction mark, a zero-width joiner) a name may start with. */
const LEADING_BLANKS = /^[\s\p{Cf}]+/u

let table: Map<string, MonogramGlyph> | null = null

function glyphs(): Map<string, MonogramGlyph> {
  table ??= new Map(
    MONOGRAM_GLYPHS.map((entry) => {
      const [char = '', width, height, ...path] = entry.split(' ')
      return [char, { char, width: Number(width), height: Number(height), d: path.join(' ') }]
    }),
  )
  return table
}

/** The outline of the first character of `name` as people read it, or null when there is none. */
export function monogramGlyph(name: string): MonogramGlyph | null {
  const first = Array.from(name.replace(LEADING_BLANKS, ''))[0]
  if (!first) return null
  return glyphs().get(first.toLocaleUpperCase('en')) ?? null
}

const svgOpen = (size: number) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`

/** Lucide's shopping bag (ISC), white on `color`, in the central 45 %. */
function bag(color: string, size: number): string {
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24">` +
    `<rect width="24" height="24" fill="${color}"/>` +
    '<g transform="translate(6.6 6.6) scale(0.45)" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M16 10a4 4 0 0 1-8 0"/><path d="M3.103 6.034h17.794"/>' +
    '<path d="M3.4 5.467a2 2 0 0 0-.4 1.2V20a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6.667a2 2 0 0 0-.4-1.2l-2-2.667A2 2 0 0 0 17 2H7a2 2 0 0 0-1.6.8z"/>' +
    '</g></svg>'
  )
}

const round = (value: number) => Math.round(value * 100) / 100

/**
 * The monogram of `name`, `size` px square, as SVG: its first letter white and centred on `color`
 * (a `#rrggbb` the caller checked), or the shopping bag when the letter cannot be drawn.
 */
export function monogramSvg(name: string, color: string, size: number): string {
  const glyph = monogramGlyph(name)
  if (!glyph) return bag(color, size)
  const scale = (size * LETTER) / BOX
  const x = round((size - glyph.width * scale) / 2)
  const y = round((size - glyph.height * scale) / 2)
  return (
    svgOpen(size) +
    `<rect width="${size}" height="${size}" fill="${color}"/>` +
    `<path fill="#ffffff" transform="translate(${x} ${y}) scale(${scale})" d="${glyph.d}"/>` +
    '</svg>'
  )
}
