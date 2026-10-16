import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderSearchForm } from '@/components/layout/header-search-form'
import {
  IDLE_FALLBACK_MS,
  PHONE_TOUCH_QUERY,
  loadedOverlay,
  resetOverlayLoader,
} from '@/features/search/overlay-loader'
import { useRecentSearches } from '@/features/search/recent-searches'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'

// The phone search on a touch phone (iOS raises the keyboard only for a focus inside the tap):
// the overlay's code is preloaded on idle, and with it in, a tap opens the overlay and moves the
// focus to its field before the tap's handler returns.

vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }), usePathname: () => '/' }))

const media = stubBrowserApis()
const idle = vi.hoisted(() => ({ callbacks: [] as IdleRequestCallback[] }))

function renderPhone() {
  const { wrapper } = clientProviders()
  render(<HeaderSearchForm size="md" overlay />, { wrapper })
  return screen.getByRole('searchbox', { name: 'جستجو' })
}

function runIdle() {
  for (const callback of idle.callbacks.splice(0)) {
    callback({ didTimeout: false, timeRemaining: () => 50 })
  }
}

const requestIdle = (callback: IdleRequestCallback) => {
  idle.callbacks.push(callback)
  return idle.callbacks.length
}

beforeEach(() => {
  resetOverlayLoader()
  useRecentSearches.setState({ items: [] })
  media.set((query) => query === PHONE_TOUCH_QUERY)
  idle.callbacks.length = 0
  window.requestIdleCallback = requestIdle
  window.cancelIdleCallback = () => {}
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('the phone search field on a touch phone', () => {
  it('is a real, writable field that names its dialog', () => {
    const field = renderPhone()
    expect(field).not.toHaveAttribute('readonly')
    expect(field).toHaveAttribute('aria-haspopup', 'dialog')
  })

  it('preloads the overlay code once the page is idle after hydration', async () => {
    renderPhone()
    expect(idle.callbacks).toHaveLength(1)
    expect(loadedOverlay()).toBeNull()
    act(() => runIdle())
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
  })

  it('falls back to a timer where requestIdleCallback is missing', async () => {
    Reflect.deleteProperty(window, 'requestIdleCallback')
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    renderPhone()
    act(() => vi.advanceTimersByTime(IDLE_FALLBACK_MS - 1))
    expect(loadedOverlay()).toBeNull()
    act(() => vi.advanceTimersByTime(1))
    vi.useRealTimers()
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
  })

  it('preloads nothing with a mouse or on a wider screen', () => {
    media.set(() => false)
    renderPhone()
    expect(idle.callbacks).toHaveLength(0)
  })

  it('with the code in, opens the overlay and focuses its field inside the tap', async () => {
    const field = renderPhone()
    act(() => runIdle())
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
    await act(async () => {})

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
    act(() => runIdle())
    await waitFor(() => expect(loadedOverlay()).not.toBeNull())
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
