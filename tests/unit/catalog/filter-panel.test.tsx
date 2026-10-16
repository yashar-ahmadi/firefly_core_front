import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterPanel } from '@/features/catalog/components/listing/filter-panel'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups, type FacetGroups } from '@/features/catalog/listing-filters'
import { stubBrowserApis } from '../support/dom-stubs'
import { MOBILE_FILTERS } from './filter-fixtures'
import { resetNavigation } from './navigation-harness'

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

stubBrowserApis()

// The groups of a store-wide listing (brands and price), then the same listing after a
// navigation picked a category: its attributes are new groups.
const BEFORE: FacetGroups = { ...facetGroups(MOBILE_FILTERS, {}), attributes: [] }
const AFTER: FacetGroups = facetGroups(MOBILE_FILTERS, {})

function panel(groups: FacetGroups) {
  return (
    <ListingUrlProvider context={{}} basePath="/product/list/">
      <FilterPanel groups={groups} />
    </ListingUrlProvider>
  )
}

const trigger = (name: string) => screen.getByRole('button', { name })

beforeEach(() => resetNavigation())

describe('FilterPanel groups', () => {
  it('opens a group a navigation adds, and keeps closed the ones the visitor closed', async () => {
    const view = render(panel(BEFORE))
    expect(trigger('برند')).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(trigger('برند'))
    expect(trigger('برند')).toHaveAttribute('aria-expanded', 'false')

    view.rerender(panel(AFTER))
    for (const name of ['حافظه داخلی', 'حافظه رم', 'رنگ']) {
      expect(trigger(name)).toHaveAttribute('aria-expanded', 'true')
    }
    expect(trigger('برند')).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(trigger('برند'))
    expect(trigger('برند')).toHaveAttribute('aria-expanded', 'true')
  })
})
