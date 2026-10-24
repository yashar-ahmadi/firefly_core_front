import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// Corners come from the shop's radius scale (src/lib/theme/css.ts → `rounded-control`,
// `rounded-card`, `rounded-pill`, `rounded-check`), never a raw length: a raw one ignores the
// preset (the checkbox's `rounded-[0.4rem]`, Plan 1 Task 9, carried into Plan 5 Task 8).
// `rounded-[inherit]` and lengths computed from a token stay allowed.
const SRC = resolve(process.cwd(), 'src')
const RAW_RADIUS = /\brounded(?:-[a-z]{1,2})?-\[(?:\d|\.\d)[^\]]*\]/g

function sources(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => /\.(?:ts|tsx)$/.test(file))
    .map((file) => join(SRC, file))
}

describe('radius tokens', () => {
  it('the pattern finds a raw length and lets tokens through', () => {
    const found = (text: string) => text.match(RAW_RADIUS) ?? []
    expect(found('rounded-[0.4rem] rounded-t-[6px] rounded-[.5rem]')).toHaveLength(3)
    expect(
      found('rounded-check rounded-[inherit] rounded-[calc(var(--radius-control)-1px)]'),
    ).toEqual([])
  })

  it('no source file rounds a corner with a raw length', () => {
    const found = sources().flatMap((file) =>
      (readFileSync(file, 'utf8').match(RAW_RADIUS) ?? []).map((match) => `${file}: ${match}`),
    )
    expect(found).toEqual([])
  })

  it('the checkbox uses the check radius', () => {
    const checkbox = readFileSync(join(SRC, 'components/ui/checkbox.tsx'), 'utf8')
    expect(checkbox).toMatch(/\brounded-check\b/)
  })
})
