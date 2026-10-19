import { describe, expect, it } from 'vitest'
import { importersOf, importGraph } from '../support/import-graph'

// Turbopack puts every client component a page's server modules import into that page's chunks,
// rendered or not (measured: DynamicSlot's dialog-link button cost home, product and cart
// 0.2–0.7 KB with every slot empty). So the pages that show inline slots alone import InlineSlot,
// whose graph holds no client code; only the checkout imports DynamicSlot and its button.

const BUTTON = 'src/features/content/dynamic/slot-dialog-link.tsx'
const DYNAMIC_SLOT = 'src/features/content/dynamic/dynamic-slot.tsx'

describe('what the slots bring into a page', () => {
  it('InlineSlot: no client module at all', () => {
    expect(importGraph('src/features/content/dynamic/inline-slot.tsx').clientFiles).toEqual([])
  })

  it.each([
    ['home', 'src/app/(shop)/page.tsx'],
    ['product', 'src/app/(shop)/product/[slug]/page.tsx'],
    ['cart', 'src/app/(shop)/cart/page.tsx'],
  ])('the %s page shows its slot inline, without the dialog-link button', (_, page) => {
    const { files } = importGraph(page)
    expect(files).toContain('src/features/content/dynamic/inline-slot.tsx')
    expect(files).not.toContain(BUTTON)
    expect(files).not.toContain(DYNAMIC_SLOT)
  })

  it('the checkout page is the only module that imports DynamicSlot', () => {
    // A slot placed anywhere else as a client island is a deliberate choice: this list changes
    // with it (and the page's budget is measured again).
    expect(importersOf(DYNAMIC_SLOT)).toEqual(['src/app/(checkout)/checkout/page.tsx'])
  })

  it('the checkout brings the button, whose dialog is a chunk of its own (import())', () => {
    const { files } = importGraph('src/app/(checkout)/checkout/page.tsx')
    expect(files).toContain(BUTTON)
    expect(files).toContain('src/features/content/dynamic/slot-dialog.tsx')
  })
})
