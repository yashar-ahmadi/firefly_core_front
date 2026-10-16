import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FilterSheet } from '@/features/catalog/components/listing/filter-sheet'
import { ListingUrlProvider } from '@/features/catalog/components/listing/use-listing-url'
import { facetGroups } from '@/features/catalog/listing-filters'
import { MOBILE_FILTERS } from '../catalog/filter-fixtures'
import { NavigatingRouter } from '../catalog/navigation-harness'
import { stubBrowserApis } from '../support/dom-stubs'

// The phone filter sheet loads its code on the first opening. When that download fails (a stale
// chunk after a deploy, a dropped connection), the filters show in place instead. Opened with
// fireEvent: no hover or focus preload runs alongside the loader (Vitest hands a concurrent
// second import of a failing mock the real module; browsers fail both).

vi.mock(
  'next/navigation',
  async () => (await import('../catalog/navigation-harness')).navigationMock,
)
vi.mock('@/features/catalog/components/listing/filter-sheet-panel', () =>
  Object.defineProperty({}, 'FilterSheetPanel', {
    enumerable: true,
    get() {
      throw new Error('ChunkLoadError: Loading chunk failed.')
    },
  }),
)

stubBrowserApis()

describe('FilterSheet whose sheet cannot load', () => {
  it('shows the filters in place under the button', async () => {
    render(
      <NavigatingRouter initial="brand=apple">
        <ListingUrlProvider context={{ category: 'mobile-phone' }} basePath="/c/">
          <FilterSheet
            groups={facetGroups(MOBILE_FILTERS, { category: 'mobile-phone' })}
            count={3}
          />
        </ListingUrlProvider>
      </NavigatingRouter>,
    )
    const button = screen.getByRole('button', { name: 'فیلترها، ۱ فیلتر فعال' })
    expect(button).toHaveAttribute('aria-haspopup', 'dialog')
    fireEvent.click(button)
    const region = await screen.findByRole('region', { name: 'فیلترها' })
    expect(button).toHaveAttribute('aria-expanded', 'true')
    expect(button).not.toHaveAttribute('aria-haspopup')
    expect(within(region).getAllByRole('checkbox').length).toBeGreaterThan(0)
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})
