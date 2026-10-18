import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// A JSX attribute written as a plain string (`label="…"`) is not a JavaScript string: escapes in it
// are not processed, so `label="آماده\u{200C}سازی"` shows shoppers a literal `\u{200C}`. Write such
// text as an expression (`label={'آماده\u{200C}سازی'}`) or with the real character. This scans the
// source so the mistake cannot come back (it shipped twice: the cart's clear dialog and the review
// composer's spinner, Plan 4 Task 9).
const SRC = resolve(process.cwd(), 'src')

/** An attribute name, `="`, then a string that holds a `\u{…}` or `\uXXXX` escape (`\u0…` too). */
const ESCAPE_IN_ATTRIBUTE =
  /(?:^|[\s{(])([A-Za-z][\w:-]*)="([^"\n]*\\u(?:\{[\dA-Fa-f]+\}|[\dA-Fa-f]{4})[^"\n]*)"/g

function tsxFiles(): string[] {
  return readdirSync(SRC, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.tsx'))
    .map((file) => join(SRC, file))
}

/** Every `file:line attr="…"` that carries an escape inside a JSX attribute string. */
function escapesInAttributes(source: string, file = 'source'): string[] {
  const found: string[] = []
  source.split('\n').forEach((line, index) => {
    for (const match of line.matchAll(ESCAPE_IN_ATTRIBUTE)) {
      found.push(`${file}:${index + 1} ${match[1]}="${match[2]}"`)
    }
  })
  return found
}

describe('JSX attribute strings carry no escape sequences', () => {
  it('finds the mistake it guards against (and leaves expressions alone)', () => {
    expect(escapesInAttributes('<Spinner label="آماده\\u{200C}سازی" />')).toHaveLength(1)
    expect(escapesInAttributes('  description="می\\u200Cشود"')).toHaveLength(1)
    expect(escapesInAttributes('<abbr title="\\u0654" />')).toHaveLength(1)
    expect(escapesInAttributes("<Spinner label={'آماده\\u{200C}سازی'} />")).toEqual([])
    expect(escapesInAttributes("const label = 'آماده\\u{200C}سازی'")).toEqual([])
    expect(escapesInAttributes('<input pattern="[0-9]{4}" />')).toEqual([])
  })

  it('in every component under src/', () => {
    const found = tsxFiles().flatMap((file) =>
      escapesInAttributes(readFileSync(file, 'utf8'), file.slice(SRC.length + 1)),
    )
    expect(found).toEqual([])
  })
})
