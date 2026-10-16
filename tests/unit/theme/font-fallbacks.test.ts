// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The Persian-tuned stand-ins for Vazirmatn (src/styles/font-fallbacks.css) must be the ones
// next/font lists after the font (src/lib/fonts.ts), each sized and given vertical metrics.

const css = readFileSync('src/styles/font-fallbacks.css', 'utf8')
const fontsTs = readFileSync('src/lib/fonts.ts', 'utf8')
const faces = [...css.matchAll(/@font-face\s*{([^}]*)}/g)].map((match) => match[1]!)
const family = (face: string) => /font-family:\s*'([^']+)'/.exec(face)?.[1]

describe('Vazirmatn fallback faces', () => {
  it('declares every family that next/font lists as a fallback, regular and bold', () => {
    const listed = [...fontsTs.matchAll(/'(vazirmatn Fallback [^']+)'/g)].map((match) => match[1])
    expect(listed.length).toBeGreaterThan(0)
    for (const name of listed) {
      const weights = faces
        .filter((face) => family(face) === name)
        .map((face) => /font-weight:\s*([^;]+);/.exec(face)?.[1])
      expect(weights, name).toEqual(['100 600', '700 900'])
    }
  })

  it('sizes each face and gives it Vazirmatn’s ascent and descent', () => {
    expect(faces.length).toBeGreaterThan(0)
    for (const face of faces) {
      const size = parseFloat(/size-adjust:\s*([\d.]+)%/.exec(face)?.[1] ?? 'NaN')
      const ascent = parseFloat(/ascent-override:\s*([\d.]+)%/.exec(face)?.[1] ?? 'NaN')
      const descent = parseFloat(/descent-override:\s*([\d.]+)%/.exec(face)?.[1] ?? 'NaN')
      expect(face).toMatch(/src:\s*local\(/)
      // Vazirmatn: ascent 102.54% and descent 53.71% of the em, before the face's own scaling.
      expect((ascent * size) / 100).toBeCloseTo(102.54, 0)
      expect((descent * size) / 100).toBeCloseTo(53.71, 0)
    }
  })
})
