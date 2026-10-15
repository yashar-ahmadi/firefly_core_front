import { act, render, screen } from '@testing-library/react'
import { renderToString } from 'react-dom/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Countdown, formatCountdown } from '@/components/ui/countdown'

const NOW = new Date('2026-10-15T10:00:00Z').getTime()

describe('formatCountdown', () => {
  it('formats hh:mm:ss with Persian digits', () => {
    expect(formatCountdown(3_723_000)).toBe('۰۱:۰۲:۰۳')
    expect(formatCountdown(0)).toBe('۰۰:۰۰:۰۰')
  })

  it('adds days when the time left is 24 hours or more', () => {
    expect(formatCountdown(2 * 86_400_000 + 3_723_000)).toBe('۲ روز و ۰۱:۰۲:۰۳')
  })

  it('never goes below zero', () => {
    expect(formatCountdown(-5000)).toBe('۰۰:۰۰:۰۰')
  })
})

describe('Countdown', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(NOW)
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders a stable placeholder on the server', () => {
    const html = renderToString(<Countdown endsAt={NOW + 60_000} />)
    expect(html).toContain('--:--:--')
  })

  it('ticks every second after mount and is not a live region', () => {
    render(<Countdown endsAt="2026-10-15T11:02:03Z" />)
    const timer = screen.getByRole('timer')
    expect(timer).toHaveAttribute('aria-live', 'off')
    expect(timer).toHaveTextContent('۰۱:۰۲:۰۳')
    act(() => {
      vi.advanceTimersByTime(1000)
    })
    expect(timer).toHaveTextContent('۰۱:۰۲:۰۲')
  })

  it('stops at zero and calls onEnd once', () => {
    const onEnd = vi.fn()
    render(<Countdown endsAt={NOW + 2000} onEnd={onEnd} />)
    act(() => {
      vi.advanceTimersByTime(5000)
    })
    expect(screen.getByRole('timer')).toHaveTextContent('۰۰:۰۰:۰۰')
    expect(onEnd).toHaveBeenCalledTimes(1)
  })
})
