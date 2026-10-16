import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { notify, Toaster } from '@/components/ui/toaster'

// Sonner's code is downloaded on the first toast. When that download fails (a stale chunk
// after a deploy, a dropped connection), the messages still show, in a plain status box.

vi.mock('@/components/ui/toaster-view', () =>
  Object.defineProperty({}, 'ToasterView', {
    enumerable: true,
    get() {
      throw new Error('ChunkLoadError: Loading chunk failed.')
    },
  }),
)

describe('Toaster without Sonner', () => {
  it('shows each message in a status box with a close button, errors as alerts', async () => {
    render(<Toaster />)
    act(() => notify.success('به سبد خرید اضافه شد', { id: 'added', description: 'گوشی' }))
    const region = await screen.findByRole('region', { name: 'اعلان‌ها' })
    const status = within(region).getByRole('status')
    expect(status).toHaveTextContent('به سبد خرید اضافه شد')
    expect(status).toHaveTextContent('گوشی')

    act(() => notify.error('پرداخت انجام نشد'))
    expect(await within(region).findByRole('alert')).toHaveTextContent('پرداخت انجام نشد')

    act(() => notify.dismiss('added'))
    expect(within(region).queryByRole('status')).toBeNull()

    await userEvent.click(within(region).getByRole('button', { name: 'بستن اعلان' }))
    expect(within(region).queryByRole('alert')).toBeNull()
  })

  it('hides a message by itself after a while', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    render(<Toaster />)
    act(() => notify.info('کد کپی شد'))
    const region = await screen.findByRole('region', { name: 'اعلان‌ها' })
    expect(within(region).getByRole('status')).toHaveTextContent('کد کپی شد')
    act(() => vi.advanceTimersByTime(6_000))
    expect(within(region).queryByRole('status')).toBeNull()
    vi.useRealTimers()
  })
})
