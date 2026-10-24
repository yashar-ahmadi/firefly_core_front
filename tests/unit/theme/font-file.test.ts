// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// The self-hosted Vazirmatn (src/lib/fonts.ts) is a subset (Plan 5 Task 8): Basic Latin and
// Latin-1, Arabic with its supplement and presentation forms, general punctuation, letterlike
// symbols and arrows (the command is in fonts.ts). The full variable font was 111 KB, preloaded
// on every first visit; the subset keeps every glyph a Persian shop's text uses (checked with
// fontTools when it was made: no Persian letter, digit or mark missing) at about 85 KB.
const FONT = 'src/assets/fonts/vazirmatn/Vazirmatn-wght.woff2'

describe('the self-hosted font', () => {
  it('is a woff2 file', () => {
    expect(readFileSync(FONT).subarray(0, 4).toString('latin1')).toBe('wOF2')
  })

  it('is the subset, not the full 111 KB font', () => {
    expect(readFileSync(FONT).length).toBeLessThan(90_000)
  })
})
