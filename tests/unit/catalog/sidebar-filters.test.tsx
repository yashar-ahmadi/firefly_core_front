import { render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SidebarFilters } from '@/features/catalog/components/listing/sidebar-filters'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups } from '@/features/catalog/listing-filters'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { MOBILE_FILTERS } from './filter-fixtures'
import { resetNavigation } from './navigation-harness'

// The listing's desktop sidebar (Plan 5 Task 8, the listing TBT carry): its filters (every
// facet's options, the price range: about 380 elements) were server-rendered and hydrated at
// every width, though hidden below lg, where the phone's sheet holds them instead. They now
// render from lg only: phones and tablets neither download their HTML nor hydrate it.

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

const media = stubBrowserApis()
const GROUPS = facetGroups(MOBILE_FILTERS, {})

function sidebar() {
  return (
    <ListingUrlProvider context={{}} basePath="/product/list/">
      <SidebarFilters groups={GROUPS} />
    </ListingUrlProvider>
  )
}

beforeEach(() => {
  resetNavigation()
  media.set(() => false)
})

describe('SidebarFilters', () => {
  it('the server renders none of the filters (no viewport yet)', () => {
    const html = renderToString(sidebar())
    expect(html).not.toContain('برند')
    expect(html).not.toMatch(/<button|<input/)
  })

  it('below lg: nothing (the sheet holds the filters)', () => {
    render(sidebar())
    expect(screen.queryByRole('button', { name: 'برند' })).toBeNull()
  })

  it('from lg: the filter panel, its groups open', () => {
    media.set(minWidth(64))
    render(sidebar())
    expect(screen.getByRole('button', { name: 'برند' })).toHaveAttribute('aria-expanded', 'true')
  })
})
