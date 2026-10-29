import { render, screen, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { renderToString } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { FacetList } from '@/features/catalog/components/listing/facet-list'
import { FilterPanel } from '@/features/catalog/components/listing/filter-panel'
import { FilterPanelSkeleton } from '@/features/catalog/components/listing/filter-panel-skeleton'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups, SEARCHABLE_OVER, type FacetGroups } from '@/features/catalog/listing-filters'
import { stubBrowserApis } from '../support/dom-stubs'
import { LIST_CATEGORIES, MOBILE_FILTERS, STORE_BRANDS } from './filter-fixtures'

// The desktop sidebar's stand-in until the viewport is known (Plan 5 Task 8 fix round): the
// filter panel's outline in static HTML, so the panel that replaces it on a desktop moves nothing
// (an empty filtered listing's footer moved: CLS 0.0101 at 1440x900). Each row has the real
// control's height; `sidebar-stability.spec.ts` compares the two heights in a browser.

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

stubBrowserApis()
const MOBILE = facetGroups(MOBILE_FILTERS, {})
const STORE: FacetGroups = {
  categories: LIST_CATEGORIES,
  brands: STORE_BRANDS,
  attributes: [],
  price: { min: 1_000_000, max: 90_000_000 },
}

const skeleton = (groups: FacetGroups) => render(<FilterPanelSkeleton groups={groups} />)

describe('FilterPanelSkeleton', () => {
  it('outlines the panel’s groups by title, in the panel’s order', () => {
    for (const groups of [MOBILE, STORE]) {
      const { unmount } = render(
        <ListingUrlProvider context={{}} basePath="/product/list/">
          <FilterPanel groups={groups} />
        </ListingUrlProvider>,
      )
      const titles = [...document.querySelectorAll('h3 button')].map(
        (trigger) => trigger.textContent,
      )
      unmount()
      const { container } = skeleton(groups)
      expect(
        [...container.querySelectorAll('[data-skeleton-group]')].map((group) => group.textContent),
      ).toEqual(titles)
      container.remove()
    }
  })

  it('has a row per option the panel lists, a box for a searched brand list, the price block', () => {
    const { container } = skeleton(STORE)
    const rows = (group: string) =>
      container.querySelector(`[data-skeleton-body="${group}"]`)!.querySelectorAll('[data-row]')
    // «همهٔ دسته‌ها» and the categories with products (the tablet has none).
    expect(rows('category')).toHaveLength(4)
    // Over eight brands: the search box and the list's scroll box (max-h-72), filled.
    const brand = container.querySelector('[data-skeleton-body="brand"]')!
    expect(brand.querySelector('[data-search]')).toHaveClass('mb-1', 'h-12')
    expect(brand.querySelector('[data-scroll]')).toHaveClass('max-h-72', 'overflow-hidden')
    expect(rows('brand')).toHaveLength(7)
    expect(container.querySelector('[data-skeleton-body="price"] [data-price]')).not.toBeNull()
    // The four switches.
    expect(container.querySelectorAll('[data-switch]')).toHaveLength(4)
  })

  it('draws a swatch group’s pills by name, a plain attribute’s rows', () => {
    const { container } = skeleton(MOBILE)
    const colour = container.querySelector('[data-skeleton-body="attribute-10001"]')
    expect(colour?.querySelectorAll('[data-pill]')).toHaveLength(3)
    expect(colour).toHaveTextContent('مشکی')
    expect(
      container
        .querySelector('[data-skeleton-body="attribute-10002"]')!
        .querySelectorAll('[data-row]'),
    ).toHaveLength(MOBILE.attributes[0]!.values.length)
    expect(container.querySelector('[data-skeleton-body="brand"] [data-search]')).toBeNull()
  })

  it('is static and hidden from assistive tech: no control, no Radix', () => {
    const html = renderToString(<FilterPanelSkeleton groups={STORE} />)
    expect(html).not.toMatch(/<button|<input|role=|data-state|tabindex/)
    skeleton(STORE)
    expect(within(document.body).queryAllByRole('heading')).toHaveLength(0)
    expect(document.querySelector('[data-filter-skeleton]')).toHaveAttribute('aria-hidden', 'true')
  })

  it('is a Server Component: no client code for the listing to ship', () => {
    const source = readFileSync(
      'src/features/catalog/components/listing/filter-panel-skeleton.tsx',
      'utf8',
    )
    expect(source).not.toMatch(/^['"]use client['"]/m)
    expect(source).not.toMatch(/from 'radix-ui'|@\/components\/ui\/|use(State|Effect|Ref)\b/)
  })

  it('outlines the brand search from the count the panel offers it at: one shared threshold', () => {
    // The two kept their own copies of «over eight» (Plan 5 Task 9, carried from Task 8's
    // re-review): one changed alone, the outline would no longer match the panel's height.
    for (const count of [SEARCHABLE_OVER, SEARCHABLE_OVER + 1]) {
      const options = STORE_BRANDS.slice(0, count)
      expect(options).toHaveLength(count)
      const panel = render(
        <FacetList
          facet={{ kind: 'brand', options }}
          legend="برند"
          selected={[]}
          onChange={() => {}}
        />,
      )
      const searched = screen.queryByRole('searchbox') !== null
      panel.unmount()
      const { container } = skeleton({ ...STORE, brands: options })
      expect(container.querySelector('[data-skeleton-body="brand"] [data-search]') !== null).toBe(
        searched,
      )
      expect(searched, `${count} brands`).toBe(count > SEARCHABLE_OVER)
      container.remove()
    }
    // Shared from the pure module both import (not from facet-list.tsx: a Server Component gets a
    // client module's exports as client references, never the value).
    for (const file of ['filter-panel-skeleton.tsx', 'facet-list.tsx']) {
      const source = readFileSync(`src/features/catalog/components/listing/${file}`, 'utf8')
      expect(source, file).toMatch(
        /SEARCHABLE_OVER[\s\S]*from '@\/features\/catalog\/listing-filters'/,
      )
      expect(source, file).not.toMatch(/(?:SEARCH\w*_OVER) = \d/)
    }
  })
})
