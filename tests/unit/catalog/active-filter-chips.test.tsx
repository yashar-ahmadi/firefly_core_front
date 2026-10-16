import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  ActiveFilterChips,
  ClearFiltersButton,
} from '@/features/catalog/components/listing/active-filter-chips'
import { LISTING_RESULTS_ID } from '@/features/catalog/components/listing/listing-focus'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups } from '@/features/catalog/listing-filters'
import { focusedElement } from '../support/dom-stubs'
import { MOBILE_FILTERS } from './filter-fixtures'
import { navigation, NavigatingRouter, resetNavigation } from './navigation-harness'

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

const GROUPS = facetGroups(MOBILE_FILTERS, { category: 'mobile-phone' })

function renderChips(search: string) {
  render(
    <NavigatingRouter initial={search}>
      <ListingUrlProvider context={{ category: 'mobile-phone' }} basePath="/c/">
        <h2 id={LISTING_RESULTS_ID} tabIndex={-1}>
          کالاها
        </h2>
        <ActiveFilterChips groups={GROUPS} />
        <ClearFiltersButton />
      </ListingUrlProvider>
    </NavigatingRouter>,
  )
  return userEvent.setup()
}

const heading = () => screen.getByRole('heading', { name: 'کالاها' })

beforeEach(() => {
  resetNavigation()
})

describe('ActiveFilterChips focus', () => {
  it('moves focus to the chip that took the removed one’s place, at once', async () => {
    const user = renderChips('brand=apple,samsung')
    await user.click(screen.getByRole('button', { name: 'حذف فیلتر اپل' }))
    // Before the new results arrive: the chip is gone (optimistic) and focus moved on.
    expect(navigation.pending).toHaveLength(1)
    expect(screen.queryByRole('button', { name: 'حذف فیلتر اپل' })).toBeNull()
    expect(focusedElement()).toBe(screen.getByRole('button', { name: 'حذف فیلتر سامسونگ' }))
    expect(navigation.replace).toHaveBeenCalledWith('/c/?brand=samsung', { scroll: false })
  })

  it('moves focus to the results heading when the last chip goes', async () => {
    const user = renderChips('brand=apple')
    await user.click(screen.getByRole('button', { name: 'حذف فیلتر اپل' }))
    expect(screen.queryByRole('list', { name: 'فیلترهای فعال' })).toBeNull()
    expect(focusedElement()).toBe(heading())
  })

  it('moves focus to the results heading after «حذف همه»', async () => {
    const user = renderChips('brand=apple&in_stock=true&sort=sale')
    await user.click(screen.getByRole('button', { name: 'حذف همه' }))
    expect(navigation.replace).toHaveBeenCalledWith('/c/?sort=sale', { scroll: false })
    expect(focusedElement()).toBe(heading())
    expect(screen.queryByRole('list', { name: 'فیلترهای فعال' })).toBeNull()
  })

  it('moves focus to the results heading after «حذف فیلترها»', async () => {
    const user = renderChips('brand=apple')
    await user.click(screen.getByRole('button', { name: 'حذف فیلترها' }))
    expect(navigation.replace).toHaveBeenCalledWith('/c/', { scroll: false })
    expect(focusedElement()).toBe(heading())
  })
})
