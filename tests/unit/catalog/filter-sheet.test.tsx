import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FilterSheet } from '@/features/catalog/components/listing/filter-sheet'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups } from '@/features/catalog/listing-filters'
import { focusedElement, stubBrowserApis } from '../support/dom-stubs'
import { MOBILE_FILTERS } from './filter-fixtures'
import { navigation, NavigatingRouter, resetNavigation } from './navigation-harness'

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

stubBrowserApis()

beforeEach(() => {
  resetNavigation()
})

describe('FilterSheet', () => {
  it('opens from «فیلترها» (with the active count) and keeps focus inside after «حذف همه»', async () => {
    const user = userEvent.setup()
    render(
      <NavigatingRouter initial="brand=apple&in_stock=true">
        <ListingUrlProvider context={{ category: 'mobile-phone' }} basePath="/c/">
          <FilterSheet
            groups={facetGroups(MOBILE_FILTERS, { category: 'mobile-phone' })}
            count={3}
          />
        </ListingUrlProvider>
      </NavigatingRouter>,
    )
    await user.click(screen.getByRole('button', { name: 'فیلترها، ۲ فیلتر فعال' }))
    const sheet = await screen.findByRole('dialog', { name: 'فیلترها' })
    await user.click(within(sheet).getByRole('button', { name: 'حذف همه' }))
    expect(navigation.replace).toHaveBeenCalledWith('/c/', { scroll: false })
    // «حذف همه» is now disabled; focus moved to the button that shows the results.
    expect(within(sheet).getByRole('button', { name: 'حذف همه' })).toBeDisabled()
    expect(focusedElement()).toBe(within(sheet).getByRole('button', { name: 'نمایش ۳ کالا' }))
  })
})
