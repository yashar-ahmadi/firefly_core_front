import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { notify, Toaster } from '@/components/ui/toaster'

// Sonner's code is downloaded on the first toast. When that download fails (a stale chunk
// after a deploy, a dropped connection), the messages still show and are read out, in plain
// boxes inside two live regions that exist before any message is put in them.

vi.mock('@/components/ui/toaster-view', () =>
  Object.defineProperty({}, 'ToasterView', {
    enumerable: true,
    get() {
      throw new Error('ChunkLoadError: Loading chunk failed.')
    },
  }),
)

afterEach(() => {
  act(() => notify.dismiss())
  vi.useRealTimers()
})

async function regions() {
  const section = await screen.findByRole('region', { name: 'اعلان‌ها' })
  return {
    section,
    polite: within(section).getByRole('status'),
    assertive: within(section).getByRole('alert'),
  }
}

describe('Toaster without Sonner', () => {
  it('reads messages out through one polite and one assertive region, each message a box', async () => {
    render(<Toaster />)
    act(() => notify.success('به سبد خرید اضافه شد', { id: 'added', description: 'گوشی' }))
    const { polite, assertive } = await regions()
    expect(polite).toHaveAttribute('aria-live', 'polite')
    expect(assertive).toHaveAttribute('aria-live', 'assertive')
    expect(await within(polite).findByText('به سبد خرید اضافه شد')).toBeInTheDocument()
    expect(polite).toHaveTextContent('گوشی')
    expect(assertive).toBeEmptyDOMElement()

    act(() => notify.error('پرداخت انجام نشد'))
    expect(assertive).toHaveTextContent('پرداخت انجام نشد')
    // The same regions throughout: messages are put into them, never created with them.
    const again = await regions()
    expect(again.polite).toBe(polite)
    expect(again.assertive).toBe(assertive)

    act(() => notify.dismiss('added'))
    expect(polite).not.toHaveTextContent('به سبد خرید اضافه شد')
    await userEvent.click(within(assertive).getByRole('button', { name: 'بستن اعلان' }))
    expect(assertive).not.toHaveTextContent('پرداخت انجام نشد')
  })

  it('hides a message by itself after six seconds, but not while hovered or focused', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Toaster />)
    act(() => notify.info('کد کپی شد'))
    const { section, polite } = await regions()
    await within(polite).findByText('کد کپی شد')

    fireEvent.mouseEnter(section)
    act(() => vi.advanceTimersByTime(7_000))
    expect(polite).toHaveTextContent('کد کپی شد')
    fireEvent.mouseLeave(section)

    act(() => within(polite).getByRole('button', { name: 'بستن اعلان' }).focus())
    act(() => vi.advanceTimersByTime(7_000))
    expect(polite).toHaveTextContent('کد کپی شد')
    act(() => within(polite).getByRole('button', { name: 'بستن اعلان' }).blur())

    act(() => vi.advanceTimersByTime(6_000))
    expect(polite).not.toHaveTextContent('کد کپی شد')
  })
})
