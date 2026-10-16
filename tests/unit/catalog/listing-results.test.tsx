import { render, screen, waitFor } from '@testing-library/react'
import { useSearchParams } from 'next/navigation'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ListingResults } from '@/features/catalog/components/listing/listing-results'
import {
  ListingUrlProvider,
  useListingUrl,
} from '@/features/catalog/components/listing/use-listing-url'
import {
  finishNavigations,
  NavigatingRouter,
  resetNavigation,
  useRealScheduling,
} from './navigation-harness'

vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

/** Filters to Apple, as a facet would. */
function AppleOnly() {
  const { set } = useListingUrl()
  return <button onClick={() => set({ brand: ['apple'] })}>فقط اپل</button>
}

/** The results with the count the server would render for the committed URL. */
function Results() {
  const count = useSearchParams().has('brand') ? 3 : 1234
  return (
    <ListingResults count={count}>
      <p>شبکهٔ کالاها</p>
    </ListingResults>
  )
}

function renderResults() {
  render(
    <NavigatingRouter>
      <ListingUrlProvider context={{}} basePath="/product/list/">
        <AppleOnly />
        <Results />
      </ListingUrlProvider>
    </NavigatingRouter>,
  )
  const region = screen.getByText('شبکهٔ کالاها').parentElement!
  return { region, status: screen.getByRole('status') }
}

const filterToApple = () => screen.getByRole('button', { name: 'فقط اپل' }).click()

beforeEach(() => {
  resetNavigation()
})

describe('ListingResults', () => {
  useRealScheduling()

  it('stays quiet and idle on the first render', () => {
    const { region, status } = renderResults()
    expect(region).not.toHaveAttribute('aria-busy')
    expect(status).toBeEmptyDOMElement()
  })

  it('is busy and dimmed, in place, while new results are on the way', async () => {
    const { region } = renderResults()
    filterToApple()
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'true'))
    expect(region).toHaveClass('opacity-50', 'pointer-events-none')
  })

  it('announces the new count politely when they arrive', async () => {
    const { region, status } = renderResults()
    filterToApple()
    await waitFor(() => expect(region).toHaveAttribute('aria-busy', 'true'))
    expect(status).toBeEmptyDOMElement()
    finishNavigations()
    await waitFor(() => expect(region).not.toHaveAttribute('aria-busy'))
    expect(status).toHaveTextContent('۳ کالا یافت شد')
  })
})
