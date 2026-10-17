import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShareButton } from '@/features/product/components/share-button'

const mocks = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }))

vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const TITLE = 'گوشی موبایل سامسونگ گلکسی S25 اولترا'
const PATH = '/product/samsung-galaxy-s25-ultra/?variant=10002'
const URL_SHARED = `${window.location.origin}${PATH}`

/** Sets (or removes, with undefined) a navigator property for one test. */
function setNavigator(name: 'share' | 'clipboard' | 'canShare', value: unknown) {
  Object.defineProperty(window.navigator, name, { value, configurable: true, writable: true })
}

beforeEach(() => {
  mocks.error.mockReset()
  mocks.success.mockReset()
})

afterEach(() => {
  setNavigator('share', undefined)
  setNavigator('canShare', undefined)
  setNavigator('clipboard', undefined)
})

function press() {
  render(<ShareButton title={TITLE} path={PATH} />)
  fireEvent.click(screen.getByRole('button', { name: 'اشتراک\u{200C}گذاری' }))
}

describe('ShareButton', () => {
  it('opens the system share sheet with the title and the link to this variant', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    const writeText = vi.fn()
    setNavigator('share', share)
    setNavigator('clipboard', { writeText })
    press()
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: TITLE, url: URL_SHARED }))
    expect(writeText).not.toHaveBeenCalled()
    expect(mocks.success).not.toHaveBeenCalled()
  })

  it('does nothing more when the shopper closes the share sheet', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('cancelled', 'AbortError'))
    const writeText = vi.fn()
    setNavigator('share', share)
    setNavigator('clipboard', { writeText })
    press()
    await waitFor(() => expect(share).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(writeText).not.toHaveBeenCalled()
    expect(mocks.error).not.toHaveBeenCalled()
  })

  it('copies the link with a toast where there is no share sheet', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })
    press()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_SHARED))
    await waitFor(() => expect(mocks.success).toHaveBeenCalledWith('پیوند کالا کپی شد.'))
  })

  it('copies the link when sharing fails for another reason', async () => {
    setNavigator('share', vi.fn().mockRejectedValue(new DOMException('no', 'NotAllowedError')))
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })
    press()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_SHARED))
  })

  it('copies the link when the share sheet cannot take it', async () => {
    const share = vi.fn()
    setNavigator('share', share)
    setNavigator('canShare', () => false)
    const writeText = vi.fn().mockResolvedValue(undefined)
    setNavigator('clipboard', { writeText })
    press()
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(URL_SHARED))
    expect(share).not.toHaveBeenCalled()
  })

  it('says so when the link cannot be copied either', async () => {
    setNavigator('clipboard', { writeText: vi.fn().mockRejectedValue(new Error('denied')) })
    press()
    await waitFor(() =>
      expect(mocks.error).toHaveBeenCalledWith(
        'کپی پیوند انجام نشد. نشانی صفحه را از نوار مرورگر کپی کنید.',
      ),
    )
  })
})
