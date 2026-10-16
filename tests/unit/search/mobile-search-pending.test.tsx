import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import { resetOverlayLoader } from '@/features/search/overlay-loader'
import { useRecentSearches } from '@/features/search/recent-searches'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// A tap on the phone search field before the overlay's code is in: the field keeps the focus
// (and the keyboard), what is typed lands in it, and the overlay opens with it.

const gate = vi.hoisted(() => {
  let release: () => void = () => {}
  return {
    promise: new Promise<void>((resolve) => (release = resolve)),
    release: () => release(),
  }
})

vi.mock('@/features/search/search-overlay', async (importOriginal) => {
  await gate.promise
  return importOriginal()
})
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

stubBrowserApis()

beforeEach(() => {
  resetOverlayLoader()
  useRecentSearches.setState({ items: [] })
})

describe('the phone search field while the overlay code downloads', () => {
  it('keeps the focus and the typing, then opens the overlay with what was typed', async () => {
    const { wrapper } = clientProviders()
    render(<HeaderSearchForm size="md" overlay />, { wrapper })
    const field = screen.getByRole('searchbox', { name: 'جستجو' })

    await userEvent.click(field)
    expect(field).toHaveFocus()
    await userEvent.type(field, 'هدفون')
    expect(field).toHaveValue('هدفون')
    expect(screen.queryByRole('dialog')).toBeNull()

    await act(async () => gate.release())
    const dialog = await screen.findByRole('dialog', { name: 'جستجو' })
    const input = within(dialog).getByRole('combobox', { name: 'جستجو' })
    expect(input).toHaveValue('هدفون')
    await waitFor(() => expect(input).toHaveFocus())
  })
})
