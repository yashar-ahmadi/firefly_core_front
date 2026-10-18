import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PayLinkDeadline } from '@/features/payment/pay-link-deadline'

// The order's payment deadline on the link page: the time and a countdown that is no live region;
// screen readers hear it at an hour left, ten minutes left and when it ends (the shell's polite
// region), never every second; at the end the page reads the order again.

const mocks = vi.hoisted(() => ({ announce: vi.fn() }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-10-18T10:00:00+03:30'))
  mocks.announce.mockReset()
})
afterEach(() => vi.useRealTimers())

const wait = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))

describe('PayLinkDeadline', () => {
  it('speaks only at the thresholds and at the end, then asks for the order again', async () => {
    const onEnd = vi.fn()
    // Two hours left.
    render(<PayLinkDeadline expiresAt="2026-10-18T12:00:00+03:30" onEnd={onEnd} />)
    expect(screen.getByRole('timer')).toHaveAttribute('aria-live', 'off')
    expect(document.querySelector('time')).toHaveAttribute('dateTime', '2026-10-18T12:00:00+03:30')
    await wait(59 * 60_000)
    expect(mocks.announce).not.toHaveBeenCalled()
    await wait(60_000)
    expect(mocks.announce).toHaveBeenLastCalledWith(
      'یک ساعت تا پایان مهلت پرداخت این سفارش مانده است.',
    )
    await wait(50 * 60_000)
    expect(mocks.announce).toHaveBeenLastCalledWith(
      'ده دقیقه تا پایان مهلت پرداخت این سفارش مانده است.',
    )
    expect(onEnd).not.toHaveBeenCalled()
    await wait(10 * 60_000 + 1_000)
    expect(mocks.announce).toHaveBeenLastCalledWith('مهلت پرداخت این سفارش تمام شد.')
    expect(mocks.announce).toHaveBeenCalledTimes(3)
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
