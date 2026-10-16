import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The bottom navigation hides while a page's own buy bar is mounted. jsdom has no `:has()`, so
// this guards the rules themselves (the e2e checks them in Chromium).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[}\\s])${escaped} \\{([^}]*)\\}`).exec(css)?.[1]?.trim() ?? null
}

describe('the bottom navigation steps aside for a buy bar', () => {
  it('from the server HTML on, where :has() works', () => {
    expect(rule('body:has([data-sticky-buy-bar]) [data-bottom-nav]')).toBe('display: none;')
  })

  it('after hydration elsewhere, in a rule of its own (one unknown selector voids a list)', () => {
    expect(rule('body[data-buy-bar-shown] [data-bottom-nav]')).toBe('display: none;')
  })
})
