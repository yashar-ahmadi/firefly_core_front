import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  focusListingResults,
  LISTING_RESULTS_ID,
} from '@/features/catalog/components/listing/listing-focus'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('focusListingResults', () => {
  it('focuses the results heading without scrolling the page to it', () => {
    document.body.innerHTML = `<h2 id="${LISTING_RESULTS_ID}" tabindex="-1">کالاها</h2>`
    const heading = document.getElementById(LISTING_RESULTS_ID)!
    const focus = vi.spyOn(heading, 'focus')
    focusListingResults()
    expect(focus).toHaveBeenCalledExactlyOnceWith({ preventScroll: true })
    expect(document.activeElement).toBe(heading)
  })

  it('does nothing when the heading is not on the page', () => {
    expect(() => focusListingResults()).not.toThrow()
  })
})
