import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// The bottom navigation hides while a page's own bottom bar is mounted: the product page's buy
// bar, or the cart page's bar (Plan 4 Task 1). jsdom has no `:has()`, so this guards the rules
// themselves (the e2e checks them in Chromium).
const css = readFileSync(resolve(process.cwd(), 'src/styles/globals.css'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\s+/g, ' ')
  // Prettier wraps a long selector inside its parentheses.
  .replace(/\( /g, '(')
  .replace(/ \)/g, ')')

/** The declarations of the rule whose selector is exactly `selector`. */
function rule(selector: string): string | null {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[}\\s])${escaped} \\{([^}]*)\\}`).exec(css)?.[1]?.trim() ?? null
}

describe('the bottom navigation steps aside for a page’s own bar', () => {
  it('from the server HTML on, where :has() works', () => {
    expect(rule('body:has([data-sticky-buy-bar], [data-cart-bar]) [data-bottom-nav]')).toBe(
      'display: none;',
    )
  })

  it('after hydration elsewhere, in a rule of its own (one unknown selector voids a list)', () => {
    expect(
      rule(
        'body[data-buy-bar-shown] [data-bottom-nav], body[data-cart-bar-shown] [data-bottom-nav]',
      ),
    ).toBe('display: none;')
  })
})

describe('--bottom-bar-room: what floats above the bottom bar (the compare bar) clears it', () => {
  it('is the bar and the safe area on phones, in a rule every browser reads', () => {
    expect(css).toContain(':root { --bottom-bar-room: calc(4rem + env(safe-area-inset-bottom)); }')
  })

  it('is the safe area alone where no bar is mounted (checkout)', () => {
    expect(rule(':root:not(:has([data-bottom-nav], [data-sticky-buy-bar], [data-cart-bar]))')).toBe(
      '--bottom-bar-room: env(safe-area-inset-bottom);',
    )
  })

  it('follows the navigation sliding away, but never past a buy bar or a focused tab', () => {
    expect(
      rule(
        ':root[data-compact]:not(:has([data-sticky-buy-bar], [data-cart-bar])):not(:has([data-bottom-nav] :focus-visible))',
      ),
    ).toBe('--bottom-bar-room: env(safe-area-inset-bottom);')
  })

  it('is the safe area alone from md, where neither bar shows', () => {
    expect(css).toContain(
      '@media (width >= 48rem) { :root { --bottom-bar-room: env(safe-area-inset-bottom); } }',
    )
  })
})
