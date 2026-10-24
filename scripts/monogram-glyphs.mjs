// Makes src/features/pwa/monogram-glyphs.ts: the outlines of the letters the app icons' monogram
// draws (`/icons/<size>/` without a favicon or logo: src/features/pwa/monogram.ts), taken from the
// bundled Vazirmatn at its default weight (400, the weight sharp's text layout drew before). The
// server then draws the letter as an SVG path and needs no font at run time: the Docker image has
// no fontconfig, and sharp's text layout there drew nothing. Dev only (fontkit is a dev
// dependency); run it again only when the font or the characters change:
//
//   node scripts/monogram-glyphs.mjs

import { writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { openSync } from 'fontkit'

const FONT = 'src/assets/fonts/vazirmatn/Vazirmatn-wght.woff2'
const OUT = 'src/features/pwa/monogram-glyphs.ts'
/** The longer side of every outline, in the table's units. */
const BOX = 1000

/**
 * What a shop's name can start with: the Persian alphabet, the Arabic spellings of its letters
 * that keyboards still type (ي, ك, ة, hamza forms), the Latin capitals (a small letter is drawn
 * as its capital) and the digits, Latin and Persian. Anything else gets the shopping bag.
 */
export const CHARACTERS = [
  ...'اآبپتثجچحخدذرزژسشصضطظعغفقکگلمنوهی',
  ...'يكىةۀءأإؤئ',
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  ...'0123456789',
  ...'۰۱۲۳۴۵۶۷۸۹',
]

/** One table entry: `<char> <width> <height> <path>`, the outline in a BOX-unit box, y down. */
export function glyphEntry(font, char) {
  const glyph = font.glyphForCodePoint(char.codePointAt(0))
  if (!glyph || glyph.id === 0) throw new Error(`the font has no glyph for ${char}`)
  const { path } = glyph
  const { minX, minY, maxX, maxY } = path.bbox
  const scale = BOX / Math.max(maxX - minX, maxY - minY)
  const x = (value) => Math.round((value - minX) * scale)
  const y = (value) => Math.round((maxY - value) * scale)
  const points = (args) => args.map((value, at) => (at % 2 === 0 ? x(value) : y(value))).join(' ')
  const letters = { moveTo: 'M', lineTo: 'L', quadraticCurveTo: 'Q', bezierCurveTo: 'C' }
  const d = path.commands
    .map(({ command, args }) =>
      command === 'closePath' ? 'Z' : `${letters[command]}${points(args)}`,
    )
    .join('')
  if (!d) throw new Error(`the glyph for ${char} has no outline`)
  return `${char} ${x(maxX)} ${Math.round((maxY - minY) * scale)} ${d}`
}

/** The source of src/features/pwa/monogram-glyphs.ts, from the font at `fontPath`. */
export function glyphTable(fontPath = FONT) {
  const font = openSync(fontPath)
  const entries = CHARACTERS.map((char) => `  '${glyphEntry(font, char)}',`)
  return [
    `// Made by scripts/monogram-glyphs.mjs from ${FONT}`,
    '// (Vazirmatn, SIL Open Font License 1.1: src/assets/fonts/vazirmatn/OFL.txt). Do not edit.',
    '// Each entry: a character, its outline’s width and height (the longer side 1000 units, y down,',
    '// from 0 0), then the outline as an SVG path. Read by src/features/pwa/monogram.ts. Pure.',
    '',
    'export const MONOGRAM_GLYPHS: readonly string[] = [',
    ...entries,
    ']',
    '',
  ].join('\n')
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  writeFileSync(OUT, glyphTable())
  console.log(`[monogram] ${OUT}: ${CHARACTERS.length} glyphs`)
}
