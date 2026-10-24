// @vitest-environment node
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// nginx hands a location the server's `add_header` lines only while that location has none of
// its own. The shop's server sends HSTS from the server level, so every location of ours that adds
// a header (the offline copies' Vary, the media's nosniff and CSP, the static files' cache) must
// repeat the HSTS line, or those responses go out without it. Checked in the example file and in
// every nginx block DEPLOYMENT shows (Plan 5 Task 8, carried from Task 7's review).

const HSTS = /add_header Strict-Transport-Security "max-age=31536000" always;/

/** The config without comments, so a commented-out directive counts for nothing. */
const uncommented = (text: string) => text.replace(/#.*$/gm, '')

/** Every `location … { … }` block in `text`, braces balanced. */
function locations(text: string): string[] {
  const found: string[] = []
  for (const match of text.matchAll(/\blocation\b[^{;]*\{/g)) {
    let depth = 0
    for (let at = match.index + match[0].length - 1; at < text.length; at++) {
      if (text[at] === '{') depth++
      if (text[at] === '}' && --depth === 0) {
        found.push(text.slice(match.index, at + 1))
        break
      }
    }
  }
  return found
}

const example = uncommented(readFileSync('deploy/nginx.conf.example', 'utf8'))
const deploymentBlocks = [
  ...readFileSync('docs/DEPLOYMENT.md', 'utf8').matchAll(/```nginx\n([\s\S]*?)```/g),
].map((match) => uncommented(match[1]))

const sources: [string, string][] = [
  ['deploy/nginx.conf.example', example],
  ...deploymentBlocks.map((block, index): [string, string] => [
    `DEPLOYMENT nginx #${index}`,
    block,
  ]),
]

describe('nginx: HSTS survives a location’s own add_header', () => {
  it('finds the blocks it checks', () => {
    expect(deploymentBlocks.length).toBeGreaterThanOrEqual(5)
    const withHeaders = sources.flatMap(([, text]) =>
      locations(text).filter((block) => /\badd_header\b/.test(block)),
    )
    // The example's static files and pages; DEPLOYMENT's single-origin media and pages.
    expect(withHeaders.length).toBeGreaterThanOrEqual(4)
  })

  it.each(sources)('%s: every location with an add_header repeats HSTS', (_, text) => {
    for (const block of locations(text)) {
      if (!/\badd_header\b/.test(block)) continue
      expect(block, block.split('\n')[0]).toMatch(HSTS)
    }
  })

  it('the single-origin server sends HSTS at its own level too', () => {
    const singleOrigin = deploymentBlocks.find((block) =>
      /location \/secureAccessPanel\//.test(block),
    )
    expect(singleOrigin).toBeDefined()
    // Outside its locations: the server level, for the locations that add nothing.
    let serverLevel = singleOrigin!
    for (const block of locations(singleOrigin!)) serverLevel = serverLevel.replace(block, '')
    expect(serverLevel).toMatch(HSTS)
  })
})
