import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildCustomFontCss, CUSTOM_FONT_URL, FONT_FALLBACK_STACK } from '@/lib/theme/custom-font'

const globals = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')

describe('custom font CSS', () => {
  it('declares StoreCustom from public/fonts/custom and puts it first in --font-sans', () => {
    expect(CUSTOM_FONT_URL).toBe('/fonts/custom/font.woff2')
    expect(buildCustomFontCss()).toBe(
      "@font-face{font-family:'StoreCustom';src:url('/fonts/custom/font.woff2') format('woff2');font-weight:100 900;font-display:swap}" +
        `:root{--font-sans:'StoreCustom',${FONT_FALLBACK_STACK}}`,
    )
    expect(FONT_FALLBACK_STACK.startsWith('var(--font-vazirmatn),')).toBe(true)
  })

  it('keeps the fallback stack in sync with --font-sans in globals.css', () => {
    const declared = /--font-sans:\s*([^;]+);/.exec(globals)?.[1]
    const normalize = (stack: string) => stack.replace(/\s+/g, '').replaceAll('"', "'")
    expect(normalize(declared ?? '')).toBe(normalize(FONT_FALLBACK_STACK))
  })

  it('declares --font-sans in a non-inline @theme block, so a runtime override takes effect', () => {
    // `@theme inline` would copy the stack into every utility and ignore the variable.
    const block = /@theme(\s+\w+)?\s*\{[^}]*--font-sans:/.exec(globals)
    expect(block).not.toBeNull()
    expect(block?.[1]).toBeUndefined()
  })
})
