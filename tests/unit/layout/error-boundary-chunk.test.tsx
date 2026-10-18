import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The root error boundary (src/app/error.tsx) sits above the shop layout, so Turbopack builds its
// chunks without the layout's: a static import of the error view put a second copy of next/link,
// Button and the icons on every page (Plan 4 Task 1, ruling P4-R2). The view loads when the
// boundary shows; when its chunk cannot load (a deploy since the page loaded, no connection), a
// plain message with a reload stands in, built from nothing the layout's chunks carry.

const reloadPage = vi.hoisted(() => vi.fn())
vi.mock('@/lib/navigation/hard-navigation', () => ({ reloadPage, loadPage: vi.fn() }))
vi.mock('@/components/layout/error-view', () => ({
  get ErrorView(): never {
    throw new Error('ChunkLoadError: the chunk is gone')
  },
}))

let consoleError: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  consoleError.mockRestore()
  vi.clearAllMocks()
})

describe('error.tsx without its view', () => {
  it('says what happened, in the skip link target, and reloads the page', async () => {
    const { default: RootError } = await import('@/app/error')
    const user = userEvent.setup()
    const error = Object.assign(new Error('boom'), { digest: '4096538751' })
    const { container } = render(<RootError error={error} reset={vi.fn()} retry={vi.fn()} />)
    const heading = await screen.findByRole('heading', { level: 1, name: 'مشکلی پیش آمد' })
    expect(container.querySelector('main#main')).toContainElement(heading)
    expect(heading).toHaveFocus()
    expect(screen.getByText(/دوباره تلاش کنید/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'تلاش دوباره' }))
    expect(reloadPage).toHaveBeenCalledTimes(1)
    expect(consoleError).toHaveBeenCalledWith('[error-boundary]', '4096538751', error)
    // A plain link home, and the reference that matches the server log.
    expect(screen.getByRole('link', { name: 'صفحه\u{0654} اصلی' })).toHaveAttribute('href', '/')
    expect(screen.getByText('4096538751')).toHaveAttribute('dir', 'ltr')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex')
    // Alone under the root layout: the message fills the viewport.
    expect(heading.parentElement).toHaveClass('min-h-dvh')
  })

  it('inside the checkout layout’s <main>, the fallback takes only its own height', async () => {
    const { default: CheckoutError } = await import('@/app/(checkout)/error')
    render(<CheckoutError error={new Error('boom')} reset={vi.fn()} retry={vi.fn()} />)
    const heading = await screen.findByRole('heading', { level: 1, name: 'مشکلی پیش آمد' })
    // Between the checkout header and footer: no full-viewport block.
    expect(heading.parentElement).not.toHaveClass('min-h-dvh')
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeInTheDocument()
  })
})
