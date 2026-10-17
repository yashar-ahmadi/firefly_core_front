import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import {
  PHONE_TOUCH_QUERY,
  loadedOverlay,
  resetOverlayLoader,
} from '@/features/search/overlay-loader'
import { useRecentSearches } from '@/features/search/recent-searches'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// The phone search on a touch phone (iOS raises the keyboard only for a focus inside the tap):
// the overlay's code is preloaded on the visitor's first interaction (a touch, a scroll or a key
// anywhere, or the field's focus or press), and with it in, a tap opens the overlay and moves
// the focus to its field before the tap's handler returns.

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

const media = stubBrowserApis()

function renderPhone() {
  const { wrapper } = clientProviders()
  render(<HeaderSearchForm size="md" overlay />, { wrapper })
  return screen.getByRole('searchbox', { name: 'جستجو' })
}

/** The visitor's first touch on the page (anywhere), which preloads the overlay's code. */
async function firstTouch() {
  act(() => {
    document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))
  })
  await waitFor(() => expect(loadedOverlay()).not.toBeNull())
  await act(async () => {})
}

/**
 * Lets timers, idle callbacks and microtasks run, then reports whether the code was loaded. The
 * module is imported once beforehand (beforeAll), so a load that started resolves well within.
 */
async function settle() {
  await act(async () => new Promise((resolve) => setTimeout(resolve, 50)))
  return loadedOverlay() !== null
}

beforeAll(async () => {
  await import('@/features/search/search-overlay')
})

beforeEach(() => {
  resetOverlayLoader()
  useRecentSearches.setState({ items: [] })
  media.set((query) => query === PHONE_TOUCH_QUERY)
  // An idle page must not load it: idle callbacks run at once here.
  window.requestIdleCallback = (callback) => {
    callback({ didTimeout: false, timeRemaining: () => 50 })
    return 1
  }
  window.cancelIdleCallback = () => {}
})

afterEach(() => {
  cleanup()
})

describe('the phone search field on a touch phone', () => {
  it('is a real, writable field that names its dialog', () => {
    const field = renderPhone()
    expect(field).not.toHaveAttribute('readonly')
    expect(field).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('loads nothing while the visitor does nothing, idle or not', async () => {
    renderPhone()
    expect(await settle()).toBe(false)
  })

  it.each([
    ['a touch', () => document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))],
    // Scroll events do not bubble: a scrolled box counts as much as the page.
    ['a scroll', () => document.body.dispatchEvent(new Event('scroll'))],
    ['a key', () => document.body.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true }))],
  ])('preloads the overlay code on the first interaction anywhere: %s', async (_label, fire) => {
    renderPhone()
    act(fire)
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
    // Only the first interaction is listened for: the listeners are gone after it.
    resetOverlayLoader()
    act(fire)
    expect(await settle()).toBe(false)
  })

  it('preloads the overlay code when the field takes the focus (a Tab from a keyboard)', async () => {
    const field = renderPhone()
    act(() => field.focus())
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
  })

  it('preloads the overlay code on a press of the field', async () => {
    const field = renderPhone()
    act(() => {
      field.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }))
    })
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
  })

  it('preloads nothing with a mouse or on a wider screen', async () => {
    media.set(() => false)
    renderPhone()
    act(() => {
      document.body.dispatchEvent(new Event('touchstart', { bubbles: true }))
      document.body.dispatchEvent(new Event('scroll'))
    })
    expect(await settle()).toBe(false)
  })

  it('with the code in, opens the overlay and focuses its field inside the tap', async () => {
    const field = renderPhone()
    await firstTouch()

    // What has the focus while the tap is still being handled (a listener after React's own).
    let focusedDuringTap: Element | null = null
    const during = () => (focusedDuringTap = document.activeElement)
    document.addEventListener('click', during)
    try {
      act(() => {
        field.focus()
        field.dispatchEvent(new MouseEvent('click', { bubbles: true }))
      })
    } finally {
      document.removeEventListener('click', during)
    }
    const dialog = screen.getByRole('dialog', { name: 'جستجو' })
    const input = within(dialog).getByRole('combobox', { name: 'جستجو' })
    expect(focusedDuringTap).toBe(input)
    expect(input).toHaveFocus()
  })

  it('gives the focus back read-only after closing, writable again once it leaves', async () => {
    const field = renderPhone()
    await firstTouch()
    await userEvent.click(field)
    const dialog = await screen.findByRole('dialog', { name: 'جستجو' })
    await userEvent.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(dialog).not.toBeInTheDocument())
    // The return must not raise the keyboard: the focused field is read-only for now.
    expect(field).toHaveFocus()
    expect(field).toHaveAttribute('readonly')
    act(() => field.blur())
    expect(field).not.toHaveAttribute('readonly')
    // A new tap opens it again.
    await userEvent.click(field)
    expect(await screen.findByRole('dialog', { name: 'جستجو' })).toBeInTheDocument()
  })
})
