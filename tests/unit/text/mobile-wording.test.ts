import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The shop says «شمارهٔ موبایل» (with the ezafe, U+0654), as Plan 4's checkout and tracking do;
// Plan 3's sign-in and account labels said «شماره موبایل». Harmonised in Plan 5 Task 8 (carried
// from Plan 4 Task 10). This scans the source so the bare form cannot come back. Text the backend
// writes (an API error's `detail`) is the backend's own and never in the source.
const SRC = resolve(process.cwd(), 'src')

/** «شماره», whitespace, «موبایل»: the form without the ezafe. */
const BARE = /شماره\s+موبایل/u

function sourceFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .map((file) => join(SRC, file))
}

describe('«شمارهٔ موبایل» everywhere', () => {
  it('the pattern tells the two forms apart', () => {
    expect(BARE.test('شماره موبایل')).toBe(true)
    expect(BARE.test('شماره\u{0654} موبایل')).toBe(false)
    expect(BARE.test('شمارهٔ موبایل')).toBe(false)
  })

  it('no source file writes «شماره موبایل»', () => {
    const found = sourceFiles().flatMap((file) =>
      readFileSync(file, 'utf8')
        .split('\n')
        .flatMap((line, index) => (BARE.test(line) ? [`${file}:${index + 1}`] : [])),
    )
    expect(found).toEqual([])
  })
})
